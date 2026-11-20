import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
import { getDriveClient, getYoutubeClient } from "./src/lib/google";
import { getVideoProvider } from "./src/lib/ai-video/adapter";
import { processClipJob } from "./src/lib/clipper/service";
import { syncVideoToFirebase } from "./src/lib/firebase";
import { broadcastTelegramAlert, pollTelegramUpdates } from "./src/lib/telegram";
import { runAutonomousDailyPipeline } from "./src/lib/automation/autoSource";
import { Readable } from "stream";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const POLL_INTERVAL_MS = 3000;
let isShuttingDown = false;

// Helper: Calculate next midnight Pacific Time (PT) for YouTube quota reset
function getNextPacificMidnight(): Date {
  const now = new Date();
  // Pacific Time is UTC-8 (PST) or UTC-7 (PDT). We calculate using Intl
  const ptString = now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
  const ptDate = new Date(ptString);

  // Set to midnight tomorrow in PT
  ptDate.setDate(ptDate.getDate() + 1);
  ptDate.setHours(0, 0, 0, 0);

  const diffMs = ptDate.getTime() - new Date(ptString).getTime();
  return new Date(now.getTime() + diffMs);
}

async function writeWorkerLog(userId: string, level: "info" | "warn" | "error", message: string) {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[WORKER] [${timestamp}] [${level.toUpperCase()}] [User: ${userId}] ${message}`);
    await prisma.log.create({
      data: {
        userId,
        level,
        message: `[Worker] ${message}`,
      },
    });
  } catch (err) {
    console.error("Worker failed to write log:", err);
  }
}

/**
 * Handle AI Video Generation Jobs
 */
async function processAIGenerationJobs() {
  const pendingJobs = await prisma.generationJob.findMany({
    where: { status: "processing" },
    include: { user: true },
    take: 5,
  });

  if (!pendingJobs.length) return;

  const provider = getVideoProvider();

  for (const job of pendingJobs) {
    try {
      if (!job.providerJobId) continue;
      const statusRes = await provider.checkStatus(job.providerJobId);

      if (statusRes.status === "completed" && statusRes.videoUrl) {
        await writeWorkerLog(
          job.userId,
          "info",
          `AI Video generated successfully! Uploading to Google Drive...`
        );

        // Upload to Drive folder "AutoTube Studio/Generated"
        const drive = await getDriveClient(job.userId);

        // Find or create folder
        const folderQuery = await drive.files.list({
          q: "mimeType = 'application/vnd.google-apps.folder' and name = 'AutoTube Studio/Generated' and trashed = false",
          fields: "files(id, name)",
        });

        let folderId: string;
        if (folderQuery.data.files && folderQuery.data.files.length > 0) {
          folderId = folderQuery.data.files[0].id!;
        } else {
          const newFolder = await drive.files.create({
            requestBody: {
              name: "AutoTube Studio/Generated",
              mimeType: "application/vnd.google-apps.folder",
            },
            fields: "id",
          });
          folderId = newFolder.data.id!;
        }

        // Stream generated video URL to Drive
        const videoFetchRes = await fetch(statusRes.videoUrl);
        if (!videoFetchRes.ok || !videoFetchRes.body) {
          throw new Error(`Failed to download generated video from ${statusRes.videoUrl}`);
        }

        const fileName = `AI_Gen_${Date.now()}.mp4`;
        // Convert web ReadableStream to Node Readable
        const nodeStream = Readable.fromWeb(videoFetchRes.body as any);

        const driveFile = await drive.files.create({
          requestBody: {
            name: fileName,
            parents: [folderId],
          },
          media: {
            mimeType: "video/mp4",
            body: nodeStream,
          },
          fields: "id, name, size",
        });

        await prisma.generationJob.update({
          where: { id: job.id },
          data: {
            status: "completed",
            driveFileId: driveFile.data.id,
            videoUrl: statusRes.videoUrl,
          },
        });

        await writeWorkerLog(
          job.userId,
          "info",
          `Saved generated video to Google Drive: "${fileName}" (ID: ${driveFile.data.id})`
        );

        // If autoUpload is true, automatically queue it for YouTube upload
        if (job.autoUpload && driveFile.data.id) {
          const lastVideo = await prisma.video.findFirst({
            where: { userId: job.userId },
            orderBy: { orderIndex: "desc" },
            select: { orderIndex: true },
          });
          const nextOrder = lastVideo ? lastVideo.orderIndex + 1 : 0;

          await prisma.video.create({
            data: {
              userId: job.userId,
              driveFileId: driveFile.data.id,
              fileName: fileName,
              title: job.prompt.slice(0, 70),
              description: `Generated by AutoTube Studio.\n\nPrompt: ${job.prompt}`,
              tags: "ai,autotube,generated",
              privacy: "private",
              madeForKids: false,
              orderIndex: nextOrder,
              status: "pending",
            },
          });

          await writeWorkerLog(
            job.userId,
            "info",
            `Auto-queued generated video for YouTube upload: "${job.prompt.slice(0, 50)}"`
          );
        }
      } else if (statusRes.status === "failed") {
        await prisma.generationJob.update({
          where: { id: job.id },
          data: {
            status: "failed",
            error: statusRes.error || "Generation failed",
          },
        });
        await writeWorkerLog(
          job.userId,
          "error",
          `AI Generation failed for prompt: "${job.prompt.slice(0, 50)}": ${statusRes.error}`
        );
      }
    } catch (err: any) {
      console.error(`Error processing AI job ${job.id}:`, err);
    }
  }
}

/**
 * Handle Pending YouTube Clipper Jobs (One heavy job at a time)
 */
async function processPendingClipJobs() {
  const activeJob = await prisma.clipJob.findFirst({
    where: {
      status: { in: ["downloading", "transcribing", "analyzing", "cutting", "captioning"] },
    },
  });
  if (activeJob) {
    // Only 1 heavy clipping job allowed at a time
    return;
  }

  const nextJob = await prisma.clipJob.findFirst({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
  });
  if (!nextJob) return;

  // Launch clipping in background (non-blocking) so processVideoUploads is NEVER blocked
  processClipJob(nextJob.id).catch((err: any) => {
    console.error(`Error processing ClipJob ${nextJob.id}:`, err);
  });
}

/**
 * Handle YouTube Video Upload Loop
 */
async function processVideoUploads() {
  // 1. Find all users with isRunning = true
  const activeSettings = await prisma.automationSetting.findMany({
    where: { isRunning: true },
    include: { user: true },
  });

  for (const setting of activeSettings) {
    const userId = setting.userId;

    try {
      // Check 24-hour / Daily Quota Reset (Limit: 10 uploads per day)
      const nowDate = new Date();
      let shouldResetQuota = false;
      if (setting.lastUploadedAt) {
        const lastDate = new Date(setting.lastUploadedAt);
        const isDifferentDay = lastDate.toDateString() !== nowDate.toDateString();
        const isOlderThan24h = nowDate.getTime() - lastDate.getTime() >= 24 * 60 * 60 * 1000;
        if (isDifferentDay || isOlderThan24h) {
          shouldResetQuota = true;
        }
      }

      if (shouldResetQuota && (setting.todayUploadCount > 0 || setting.quotaPausedUntil)) {
        await prisma.automationSetting.update({
          where: { userId },
          data: {
            todayUploadCount: 0,
            quotaPausedUntil: null,
          },
        });
        setting.todayUploadCount = 0;
        setting.quotaPausedUntil = null;
        await writeWorkerLog(userId, "info", "24-hour daily quota refreshed! Reset uploads to 0/10.");

        broadcastTelegramAlert(
          `🌅 *Good Morning Suraj bhai! 24-Hour Quota Reset Hogaya!*\n\n• Aaj ka daily upload limit 10/10 refresh ho chuka hai.\n• AI ne autonomous mode me naya GTA 5 video source karke 10 viral Shorts banana shuru kar diya hai!\n• Jaise hi videos upload hongi, main aapko live updates deta rahunga.`
        ).catch(() => {});

        // Auto trigger daily 10 shorts pipeline
        runAutonomousDailyPipeline(userId, 10, "gta 5 funny moments gameplay").catch((err) =>
          console.error("Auto daily pipeline on reset failed:", err)
        );
      }

      // Check quota pause
      if (setting.quotaPausedUntil) {
        if (new Date() < setting.quotaPausedUntil) {
          // Still in quota pause period
          continue;
        } else {
          // Midnight has passed, reset quota pause & count
          await prisma.automationSetting.update({
            where: { userId },
            data: {
              quotaPausedUntil: null,
              todayUploadCount: 0,
            },
          });
          await writeWorkerLog(
            userId,
            "info",
            "Pacific midnight reset reached. Quota limit refreshed, resuming upload queue."
          );
        }
      }

      // Check daily limit
      if (setting.todayUploadCount >= setting.dailyLimit) {
        await writeWorkerLog(
          userId,
          "warn",
          `Daily upload limit reached (${setting.todayUploadCount}/${setting.dailyLimit}). Pausing until tomorrow.`
        );
        const midnight = getNextPacificMidnight();
        await prisma.automationSetting.update({
          where: { userId },
          data: { quotaPausedUntil: midnight },
        });
        continue;
      }

      // Check upload gap - ONLY wait if gapMinutes > 0
      if (setting.gapMinutes > 0 && setting.lastUploadedAt) {
        const gapMs = setting.gapMinutes * 60 * 1000;
        const elapsedMs = Date.now() - new Date(setting.lastUploadedAt).getTime();
        if (elapsedMs < gapMs) {
          const remainingSecs = Math.ceil((gapMs - elapsedMs) / 1000);
          continue;
        }
      }

      // Check if a video is already currently uploading for this user
      const isAlreadyUploading = await prisma.video.findFirst({
        where: { userId, status: "uploading" },
      });
      if (isAlreadyUploading) {
        // Already active
        continue;
      }

      // 2. Pick next pending video by orderIndex
      const nextVideo = await prisma.video.findFirst({
        where: { userId, status: "pending" },
        orderBy: { orderIndex: "asc" },
      });

      if (!nextVideo) {
        // No pending videos in queue
        continue;
      }

      // Mark video as uploading
      await prisma.video.update({
        where: { id: nextVideo.id },
        data: {
          status: "uploading",
          progress: 5,
          attempts: { increment: 1 },
        },
      });

      // 3. Obtain YouTube client
      const youtube = await getYoutubeClient(userId);

      const isLocal =
        Boolean(nextVideo.localPath && fs.existsSync(nextVideo.localPath)) ||
        nextVideo.driveFileId.startsWith("local:");

      let mediaStream: Readable;
      let isShort = false;
      let durationSec = 0;
      let videoWidth = 0;
      let videoHeight = 0;

      if (isLocal) {
        let absPath = nextVideo.localPath;
        if (!absPath || !fs.existsSync(absPath)) {
          const relPath = nextVideo.driveFileId.replace(/^local:/, "");
          absPath = path.join(process.cwd(), "public", relPath.replace(/^\//, ""));
        }

        if (!fs.existsSync(absPath)) {
          throw new Error(`Local video clip not found at: ${absPath}`);
        }

        mediaStream = fs.createReadStream(absPath);

        // For local clips, check title or duration
        if (nextVideo.title.toLowerCase().includes("#short") || (nextVideo.fileSize && nextVideo.fileSize.endsWith("s"))) {
          isShort = true;
          const match = nextVideo.fileSize?.match(/(\d+)s/);
          if (match) durationSec = parseInt(match[1], 10);
        }
      } else {
        // Stream directly from Google Drive
        const drive = await getDriveClient(userId);

        try {
          const metaRes = await drive.files.get({
            fileId: nextVideo.driveFileId,
            fields: "id, name, videoMediaMetadata",
          });
          const meta = metaRes.data.videoMediaMetadata;
          if (meta) {
            const durationMillis = Number(meta.durationMillis || 0);
            durationSec = Math.round(durationMillis / 1000);
            videoWidth = meta.width || 0;
            videoHeight = meta.height || 0;

            if ((durationSec > 0 && durationSec <= 60) || (videoHeight >= videoWidth && durationSec <= 180)) {
              isShort = true;
            }
          }
        } catch (metaErr: any) {
          console.warn("Could not retrieve Drive videoMediaMetadata:", metaErr.message);
        }

        // 4. Stream directly from Google Drive
        const driveFileRes = await drive.files.get(
          {
            fileId: nextVideo.driveFileId,
            alt: "media",
          },
          { responseType: "stream" }
        );
        mediaStream = driveFileRes.data as Readable;
      }

      // Fallback check: if filename or title contains reel or short
      if (!isShort) {
        const lowerName = `${nextVideo.fileName} ${nextVideo.title}`.toLowerCase();
        if (lowerName.includes("reel") || lowerName.includes("short")) {
          isShort = true;
        }
      }

      // Format title, description, tags, category depending on Shorts vs Video
      let finalTitle = nextVideo.title.trim();
      let finalDesc = nextVideo.description || "";
      let tagsArray = nextVideo.tags
        ? nextVideo.tags
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
        : [];

      // Gaming category detection for Free Fire / gaming reels
      const isGaming =
        `${nextVideo.title} ${nextVideo.fileName}`.toLowerCase().includes("ff") ||
        `${nextVideo.title} ${nextVideo.fileName}`.toLowerCase().includes("game");
      const categoryId = isGaming ? "20" : "22"; // 20: Gaming, 22: People & Blogs

      if (isShort) {
        // For YouTube Shorts: ensure #Shorts is in title and description
        if (!finalTitle.toLowerCase().includes("#short")) {
          finalTitle = `${finalTitle.slice(0, 91)} #Shorts`;
        }
        if (!finalDesc.toLowerCase().includes("#short")) {
          finalDesc = `${finalDesc}\n\n#Shorts #shorts #viralshorts #reels`.trim();
        }
        const tagsSet = new Set(["Shorts", "shorts", "ytshorts", "viral", ...tagsArray]);
        tagsArray = Array.from(tagsSet);

        await writeWorkerLog(
          userId,
          "info",
          `Detected SHORTS (${durationSec > 0 ? durationSec + "s" : "vertical"}, ${videoWidth}x${videoHeight}). Uploading formatted as YouTube Shorts (#Shorts)! Title: "${finalTitle}"`
        );
      } else {
        // For Regular Video (> 60s / horizontal)
        await writeWorkerLog(
          userId,
          "info",
          `Detected STANDARD VIDEO (${durationSec > 0 ? durationSec + "s" : "long-form"}). Uploading as standard video. Title: "${finalTitle}"`
        );
      }

      // Track stream progress
      let bytesUploaded = 0;
      let lastProgressUpdate = Date.now();

      mediaStream.on("data", (chunk: Buffer) => {
        bytesUploaded += chunk.length;
        const now = Date.now();
        // Update progress in DB at most every 3 seconds to avoid DB load
        if (now - lastProgressUpdate > 3000) {
          lastProgressUpdate = now;
          // Estimate progress
          prisma.video
            .update({
              where: { id: nextVideo.id },
              data: { progress: Math.min(95, 10 + Math.floor((bytesUploaded / 1000000) * 5)) },
            })
            .catch(() => {});
        }
      });

      // 5. Send snippet + status directly to YouTube resumable insert
      const insertRes = await youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title: finalTitle.slice(0, 100),
            description: finalDesc,
            tags: tagsArray,
            categoryId,
          },
          status: {
            privacyStatus: nextVideo.privacy || "private",
            selfDeclaredMadeForKids: Boolean(nextVideo.madeForKids),
          },
        },
        media: {
          body: mediaStream,
        },
      });

      const youtubeVideoId = insertRes.data.id;

      if (!youtubeVideoId) {
        throw new Error("YouTube API upload completed without returning a video ID.");
      }

      // 5.5 Set custom thumbnail if available
      const thumbPath = nextVideo.thumbnailPath;
      if (thumbPath) {
        let absThumb = thumbPath;
        if (!fs.existsSync(absThumb)) {
          absThumb = path.join(process.cwd(), "public", thumbPath.replace(/^\//, ""));
        }

        if (fs.existsSync(absThumb)) {
          try {
            await writeWorkerLog(
              userId,
              "info",
              `Uploading viral thumbnail for "${nextVideo.title}" to YouTube...`
            );
            await youtube.thumbnails.set({
              videoId: youtubeVideoId,
              media: {
                mimeType: "image/jpeg",
                body: fs.createReadStream(absThumb),
              },
            });
            await writeWorkerLog(
              userId,
              "info",
              `Viral thumbnail attached to YouTube video (ID: ${youtubeVideoId})!`
            );
          } catch (thumbErr: any) {
            await writeWorkerLog(
              userId,
              "warn",
              `Custom thumbnail notice: ${thumbErr.message} (Note: YouTube requires phone-verified channel for custom thumbnails)`
            );
          }
        }
      }

      // 6. On success: delete video from queue table so interface stays clean
      await prisma.video.delete({
        where: { id: nextVideo.id },
      });

      // Zero-Storage cleanup: delete uploaded video file and thumbnail from disk once published to YouTube
      if (nextVideo.localPath && fs.existsSync(nextVideo.localPath)) {
        try {
          fs.unlinkSync(nextVideo.localPath);
          const noCapFile = nextVideo.localPath.replace(".mp4", "_nocap.mp4");
          if (fs.existsSync(noCapFile)) fs.unlinkSync(noCapFile);
          console.log(`[Zero-Storage] Deleted uploaded video file: ${nextVideo.localPath}`);
        } catch (cleanFileErr) {
          console.warn("Could not delete uploaded clip file:", cleanFileErr);
        }
      }

      if (thumbPath) {
        let absThumb = thumbPath;
        if (!fs.existsSync(absThumb)) {
          absThumb = path.join(process.cwd(), "public", thumbPath.replace(/^\//, ""));
        }
        if (fs.existsSync(absThumb)) {
          try {
            fs.unlinkSync(absThumb);
            console.log(`[Zero-Storage] Deleted uploaded thumbnail file: ${absThumb}`);
          } catch (cleanThumbErr) {
            console.warn("Could not delete uploaded thumbnail file:", cleanThumbErr);
          }
        }
      }

      await prisma.automationSetting.update({
        where: { userId },
        data: {
          lastUploadedAt: new Date(),
          todayUploadCount: { increment: 1 },
        },
      });

      await writeWorkerLog(
        userId,
        "info",
        `SUCCESS: Uploaded and cleared from queue: "${nextVideo.title}" (YouTube ID: ${youtubeVideoId})`
      );

      // Cloud Firebase Database Sync
      syncVideoToFirebase({
        videoId: nextVideo.id,
        youtubeId: youtubeVideoId,
        title: nextVideo.title,
        durationSec: durationSec || (isShort ? 30 : 60),
        uploadedAt: new Date().toISOString(),
        status: "uploaded",
        source: isShort ? "shorts" : "video",
      }).catch((fbErr) => console.warn("[Worker] Firebase sync notice:", fbErr?.message || fbErr));

      // Telegram Bot Instant Upload Alert
      broadcastTelegramAlert(
        `🎬 *New Video Uploaded Successfully!*\n\n📌 *Title:* ${finalTitle}\n🔗 *YouTube:* https://youtu.be/${youtubeVideoId}\n⏱️ *Duration:* ${durationSec > 0 ? durationSec + "s" : "Shorts"}\n📊 *Today's Total:* ${(setting.todayUploadCount || 0) + 1}/${setting.dailyLimit} videos\n✅ *Status:* Live on channel & 0-Storage cleared.`
      ).catch((tgErr) => console.warn("[Worker] Telegram alert notice:", tgErr?.message || tgErr));

      if ((setting.todayUploadCount || 0) + 1 >= setting.dailyLimit) {
        broadcastTelegramAlert(
          `🏆 *Daily Goal Completed Suraj bhai! All 10/10 Videos Uploaded!*\n\n• Aaj ke saare 10 viral Shorts successfully YouTube channel par live ho chuke hain!\n• Channel GTA6-INDIA par views, likes aur subscribers continuously track ho rahe hain.\n• Agla 10 videos ka batch kal 24-hr quota reset ke baad automatically banega bina ruke!`
        ).catch(() => {});
      }
    } catch (err: any) {
      console.error(`Upload error for user ${userId}:`, err);

      const errorMessage =
        err.response?.data?.error?.message ||
        err.errors?.[0]?.message ||
        err.message ||
        String(err);
      const errorReason =
        err.errors?.[0]?.reason ||
        err.response?.data?.error?.errors?.[0]?.reason ||
        "";
      const isQuotaError =
        errorMessage.includes("quotaExceeded") ||
        errorMessage.includes("uploadLimitExceeded") ||
        errorMessage.includes("exceeded the number of videos") ||
        errorReason === "uploadLimitExceeded" ||
        errorReason === "quotaExceeded" ||
        (err.code === 403 && errorMessage.toLowerCase().includes("quota"));

      const isAuthError =
        errorMessage.includes("invalid_grant") ||
        errorMessage.includes("revoked") ||
        (err.code === 401 && errorMessage.toLowerCase().includes("token"));

      if (isQuotaError) {
        const midnight = getNextPacificMidnight();
        await prisma.automationSetting.update({
          where: { userId },
          data: {
            quotaPausedUntil: midnight,
          },
        });

        await writeWorkerLog(
          userId,
          "warn",
          `YouTube account daily upload limit reached (10 videos limit). Queue paused until Pacific midnight reset (~${midnight.toLocaleTimeString()}).`
        );

        broadcastTelegramAlert(
          `🛑 *YouTube Daily Upload Limit Reached!*\n\n• Suraj bhai, YouTube ne aaj ki 10 videos ki daily upload limit poori hone ki wajah se further uploads pause kar diye hain.\n• Channel par already *EXACT 10 VIDEOS* live ho chuki hain! 🏆\n• Baki bachi videos queue me bilkul safe hain, aur kal quota reset hote hi apne aap upload ho jayengi!`
        ).catch(() => {});
      } else if (isAuthError) {
        // Mark connection as needs reconnect
        await prisma.connection.updateMany({
          where: { userId },
          data: { status: "needs_reconnect" },
        });

        await prisma.automationSetting.update({
          where: { userId },
          data: { isRunning: false },
        });

        await writeWorkerLog(
          userId,
          "error",
          `Google OAuth authorization expired or was revoked. Connection marked "Needs reconnect". Please re-authenticate in the dashboard.`
        );
      }

      // Handle video retry state
      const currentVideo = await prisma.video.findFirst({
        where: { userId, status: "uploading" },
      });

      if (currentVideo) {
        if (currentVideo.attempts < 3 && !isAuthError) {
          // Retry with exponential backoff
          await prisma.video.update({
            where: { id: currentVideo.id },
            data: {
              status: "pending",
              progress: 0,
              error: `Attempt ${currentVideo.attempts} failed: ${errorMessage}`,
            },
          });
          await writeWorkerLog(
            userId,
            "warn",
            `Upload failed for "${currentVideo.title}". Will retry (Attempt ${currentVideo.attempts}/3).`
          );
        } else {
          // Max attempts reached or permanent auth error
          await prisma.video.update({
            where: { id: currentVideo.id },
            data: {
              status: "failed",
              progress: 0,
              error: errorMessage,
            },
          });
          await writeWorkerLog(
            userId,
            "error",
            `Upload permanently failed for "${currentVideo.title}": ${errorMessage}`
          );
        }
      }
    }
  }
}

/**
 * Main worker loop
 */
async function main() {
  console.log("==========================================");
  console.log("   AutoTube Studio Background Worker      ");
  console.log("==========================================");
  console.log("Worker process initialized. Monitoring active automation queues...");

  // Reset any orphaned in-progress clip jobs so they don't get stuck after restart
  try {
    await prisma.clipJob.updateMany({
      where: {
        status: { in: ["downloading", "transcribing", "analyzing", "cutting", "captioning"] },
      },
      data: {
        status: "pending",
        progress: 0,
        currentStep: "Resuming pipeline with accelerated engine...",
      },
    });
    // Also reset any orphaned uploading video status back to pending
    await prisma.video.updateMany({
      where: { status: "uploading" },
      data: { status: "pending" },
    });
  } catch (initErr) {
    console.error("Failed to reset orphaned clip jobs:", initErr);
  }

  while (!isShuttingDown) {
    try {
      await processPendingClipJobs();
      await processAIGenerationJobs();
      await processVideoUploads();
      await pollTelegramUpdates();
    } catch (err: any) {
      console.error("Worker cycle error:", err);
    }

    // Sleep before next cycle
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  console.log("Worker cleanly stopped.");
}

// Graceful shutdown handling
process.on("SIGINT", async () => {
  console.log("\nReceived SIGINT. Shutting down worker gracefully...");
  isShuttingDown = true;
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nReceived SIGTERM. Shutting down worker gracefully...");
  isShuttingDown = true;
  await prisma.$disconnect();
  process.exit(0);
});

main();
