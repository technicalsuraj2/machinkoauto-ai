import { spawn } from "child_process";
import prisma from "../prisma";
import { processClipJob } from "../clipper/service";
import { broadcastTelegramAlert } from "../telegram";
import { logMessage } from "../logger";

export interface SourcedVideo {
  id: string;
  url: string;
  title: string;
  duration: number;
  thumbnail: string;
  uploader?: string;
}

/**
 * Search YouTube for trending GTA 5 gameplay / funny moments (< 1 hour duration)
 */
export async function searchTopGamingVideo(
  query: string = "gta 5 funny moments gameplay",
  maxDurationMins: number = 60
): Promise<SourcedVideo> {
  const maxSecs = maxDurationMins * 60;
  const minSecs = 10 * 60; // at least 10 mins

  const args = [
    "-m",
    "yt_dlp",
    "-4",
    "--js-runtimes",
    "node",
    "--no-playlist",
    "--no-warnings",
    "--socket-timeout",
    "8",
    "--dump-json",
    `ytsearch5:${query}`,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn("python", args);
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0 && !stdout.trim()) {
        return reject(new Error(`YouTube search failed: ${stderr || "No video found"}`));
      }

      const lines = stdout.trim().split("\n");
      const candidates: SourcedVideo[] = [];

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          const dur = Number(data.duration) || 0;
          if (dur >= minSecs && dur <= maxSecs && data.id) {
            candidates.push({
              id: data.id,
              url: `https://www.youtube.com/watch?v=${data.id}`,
              title: data.title || "GTA 5 Crazy Moments",
              duration: dur,
              thumbnail: data.thumbnail || `https://i.ytimg.com/vi/${data.id}/hqdefault.jpg`,
              uploader: data.uploader || "YouTube Creator",
            });
          }
        } catch {}
      }

      if (candidates.length > 0) {
        // Return first suitable candidate
        return resolve(candidates[0]);
      }

      // Fallback: return default high-rated GTA 5 highlight video
      resolve({
        id: "kR8bhkVAgBY",
        url: "https://www.youtube.com/watch?v=kR8bhkVAgBY",
        title: "GTA 5 Best Moments & Gameplay Highlights",
        duration: 1800,
        thumbnail: "https://i.ytimg.com/vi/kR8bhkVAgBY/hqdefault.jpg",
        uploader: "SpeedUniverse",
      });
    });

    proc.on("error", reject);
  });
}

/**
 * Execute Full Autonomous Daily Pipeline:
 * 1. Finds GTA 5 video (< 1 hr)
 * 2. Cuts 10 viral Shorts with Hormozi captions & high-CTR thumbnails
 * 3. Queues all 10 clips for YouTube upload
 * 4. Starts upload automation
 * 5. Sends Telegram notification
 */
export async function runAutonomousDailyPipeline(
  userId: string,
  targetClipCount: number = 10,
  searchQuery: string = "gta 5 funny moments gameplay"
): Promise<{ success: boolean; jobId?: string; message: string }> {
  try {
    await logMessage(userId, "info", `[Autonomous 24/7] Sourcing gaming video ("${searchQuery}")... Target: ${targetClipCount} clips`);

    // 1. Sourcing
    const video = await searchTopGamingVideo(searchQuery, 60);
    await logMessage(userId, "info", `[Autonomous 24/7] Found video: "${video.title}" (${Math.round(video.duration / 60)}m). Generating ${targetClipCount} Shorts...`);

    // 2. Create Clip Job for target clips with 9:16 vertical & Hormozi captions
    const job = await prisma.clipJob.create({
      data: {
        userId,
        youtubeUrl: video.url,
        videoTitle: video.title,
        videoThumbnail: video.thumbnail,
        videoDuration: video.duration,
        clipCount: targetClipCount,
        clipLength: "auto",
        convertToShorts: true,
        autoCaptions: true,
        captionLanguage: "auto",
        captionStyle: "hormozi",
        captionPosition: "bottom",
        fontSize: 24,
        maxWordsPerLine: 3,
        deleteOriginal: true,
        status: "pending",
        progress: 0,
        currentStep: "Autonomous job queued...",
      },
    });

    // 3. Process clipping in background
    await processClipJob(job.id);

    // 4. Retrieve created clips and auto-queue them into Video Upload Queue
    const generatedClips = await prisma.clip.findMany({
      where: { jobId: job.id },
      orderBy: { clipIndex: "asc" },
    });

    if (generatedClips.length > 0) {
      const lastVideo = await prisma.video.findFirst({
        where: { userId },
        orderBy: { orderIndex: "desc" },
        select: { orderIndex: true },
      });
      let baseOrder = lastVideo ? lastVideo.orderIndex + 1 : 0;

      for (let i = 0; i < generatedClips.length; i++) {
        const c = generatedClips[i];
        await prisma.video.create({
          data: {
            userId,
            driveFileId: `local:clip_${i + 1}`,
            fileName: `clip_${i + 1}.mp4`,
            title: c.title || `GTA 5 Viral Highlight #${i + 1} #Shorts`,
            description: `${c.description || video.title}\n\n#Shorts #GTA5 #Gaming #Viral #Highlights`,
            tags: "gta5,gaming,shorts,viral,funny,gameplay",
            privacy: "public",
            madeForKids: false,
            orderIndex: baseOrder + i,
            status: "pending",
            localPath: c.videoPath.startsWith("/") ? `public${c.videoPath}` : c.videoPath,
            thumbnailPath: c.thumbnailPath ? (c.thumbnailPath.startsWith("/") ? `public${c.thumbnailPath}` : c.thumbnailPath) : null,
          },
        });
      }

      // 5. Ensure upload automation is running
      await prisma.automationSetting.upsert({
        where: { userId },
        create: {
          userId,
          isRunning: true,
          gapMinutes: 0,
          dailyLimit: 10,
        },
        update: {
          isRunning: true,
        },
      });

      const successNotice = `🚀 *Autonomous 24/7 Engine Finished!*\n\n• Video Sourced: "${video.title}"\n• *10 Shorts Generated* with Hormozi captions & thumbnails.\n• *All 10 clips added to Upload Queue!*\n• YouTube upload automation is now active.`;
      await broadcastTelegramAlert(successNotice);
      await logMessage(userId, "info", `[Autonomous 24/7] Successfully generated and queued 10 Shorts for "${video.title}"!`);

      return {
        success: true,
        jobId: job.id,
        message: `Generated and queued ${generatedClips.length} Shorts for YouTube upload!`,
      };
    }

    return { success: false, message: "No clips were generated." };
  } catch (err: any) {
    console.error("Autonomous pipeline error:", err);
    await logMessage(userId, "error", `[Autonomous 24/7] Failed: ${err.message}`);
    return { success: false, message: err.message };
  }
}
