import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import prisma from "../prisma";
import { downloadYouTubeVideo, fetchVideoMetadata } from "./ytdlp";
import { transcribeAudio } from "./transcriber";
import { detectMoments } from "./analyzer";
import { generateAssSubtitles } from "./captions";
import { cutVideoClip } from "./cutter";
import { generateClipThumbnail } from "./thumbnail";
import { CaptionOptions, ClipMoment } from "./types";
import { logMessage } from "../logger";
import { broadcastTelegramAlert } from "../telegram";

export async function processClipJob(jobId: string): Promise<void> {
  const job = await prisma.clipJob.findUnique({
    where: { id: jobId },
    include: { user: true },
  });

  if (!job) {
    throw new Error(`ClipJob not found: ${jobId}`);
  }

  const userId = job.userId;
  const storageDir = path.join(process.cwd(), "storage", "downloads", jobId);
  const publicClipsDir = path.join(process.cwd(), "public", "clips", jobId);

  if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
  if (!fs.existsSync(publicClipsDir)) fs.mkdirSync(publicClipsDir, { recursive: true });

  try {
    // ----------------------------------------------------
    // STEP 1: DOWNLOADING
    // ----------------------------------------------------
    await prisma.clipJob.update({
      where: { id: jobId },
      data: {
        status: "downloading",
        progress: 10,
        currentStep: "Downloading video from YouTube...",
      },
    });
    await logMessage(userId, "info", `[Clipper] Downloading: ${job.youtubeUrl}`);
    broadcastTelegramAlert(`📥 *[Stage 1/6] Video Download shuru!*\nYouTube se high-res gaming video download ho rahi hai...`).catch(() => {});

    const { videoPath, audioPath } = await downloadYouTubeVideo(
      job.youtubeUrl,
      storageDir,
      async (pct) => {
        const mappedPct = Math.round(10 + (pct / 100) * 15);
        await prisma.clipJob.update({
          where: { id: jobId },
          data: {
            progress: mappedPct,
            currentStep: `Downloading video from YouTube (${pct}%)...`,
          },
        }).catch(() => { });
      }
    );

    await prisma.clipJob.update({
      where: { id: jobId },
      data: {
        sourceVideoPath: videoPath,
        audioPath,
      },
    });

    // ----------------------------------------------------
    // STEP 2 & 3: SUPER-FAST PEAK MOMENTS & TARGETED TRANSCRIPTION (< 15 SECONDS)
    // ----------------------------------------------------
    await prisma.clipJob.update({
      where: { id: jobId },
      data: {
        status: "analyzing",
        progress: 35,
        currentStep: "Detecting top viral moments & audio energy peaks...",
      },
    });
    await logMessage(userId, "info", `[Clipper] Detecting top viral moments with audio peak analysis...`);
    broadcastTelegramAlert(`⚡ *[Stage 2/6] Viral Peak Detection!*\nAudio waveform aur energy analysis se sabse funny/viral moments chune ja rahe hain...`).catch(() => {});

    // 1. Detect candidate peak moments in ~1 second from audio wave
    const moments: ClipMoment[] = await detectMoments(
      [],
      job.videoDuration || 300,
      job.clipCount,
      job.clipLength,
      job.videoTitle || "YouTube Video",
      audioPath
    );

    // 2. Transcribe only the selected viral moments for super-fast speed (~2s per clip instead of 8 mins!)
    await prisma.clipJob.update({
      where: { id: jobId },
      data: {
        status: "transcribing",
        progress: 50,
        currentStep: `Transcribing ${moments.length} viral moment captions with Whisper...`,
      },
    });
    await logMessage(userId, "info", `[Clipper] Transcribing ${moments.length} targeted clip moments...`);
    broadcastTelegramAlert(`🎙️ *[Stage 3/6] AI Audio Transcription!*\nAI spoken dialogue aur exact word timestamps transcribe kar raha hai...`).catch(() => {});

    const allSegments: any[] = [];
    for (let i = 0; i < moments.length; i++) {
      const m = moments[i];
      const slicePath = path.join(storageDir, `slice_${i + 1}.wav`);
      try {
        await new Promise<void>((resolve, reject) => {
          const cutProc = spawn("ffmpeg", [
            "-y",
            "-ss",
            m.startTime.toFixed(2),
            "-t",
            m.duration.toFixed(2),
            "-i",
            audioPath,
            "-c",
            "copy",
            slicePath,
          ]);
          cutProc.on("close", (code) => (code === 0 ? resolve() : reject()));
          cutProc.on("error", reject);
        });

        if (fs.existsSync(slicePath)) {
          const sliceResult = await transcribeAudio(
            slicePath,
            job.captionLanguage || "auto",
            "tiny"
          );

          if (sliceResult.segments && sliceResult.segments.length > 0) {
            for (const seg of sliceResult.segments) {
              allSegments.push({
                ...seg,
                start: Math.round((seg.start + m.startTime) * 100) / 100,
                end: Math.round((seg.end + m.startTime) * 100) / 100,
                words: seg.words?.map((w: any) => ({
                  ...w,
                  start: Math.round((w.start + m.startTime) * 100) / 100,
                  end: Math.round((w.end + m.startTime) * 100) / 100,
                })),
              });
            }

            // Update title with spoken dialogue if available
            const spokenText = sliceResult.segments.map((s) => s.text).join(" ").trim();
            if (spokenText && spokenText.length > 5) {
              const hookWords = spokenText.split(/\s+/).slice(0, 6).join(" ");
              m.title = `😱 "${hookWords}..." - ${(job.videoTitle || "Highlights").slice(0, 30)} #Shorts`;
            }
          }
        }
      } catch (sliceErr: any) {
        console.warn(`[FastWhisper] Moment ${i + 1} slice warning:`, sliceErr.message);
      } finally {
        if (fs.existsSync(slicePath)) {
          try {
            fs.unlinkSync(slicePath);
          } catch {}
        }
      }
    }

    const transcriptResult = {
      language: "auto",
      duration: job.videoDuration || 300,
      segments: allSegments,
    };

    await prisma.clipJob.update({
      where: { id: jobId },
      data: {
        transcriptJson: JSON.stringify(transcriptResult),
        progress: 60,
      },
    });

    // ----------------------------------------------------
    // STEP 4: CUTTING & CAPTIONING
    // ----------------------------------------------------
    await prisma.clipJob.update({
      where: { id: jobId },
      data: {
        status: "cutting",
        progress: 65,
        currentStep: `Rendering ${moments.length} clips with captions...`,
      },
    });
    broadcastTelegramAlert(`✂️ *[Stage 4/6] 9:16 Shorts Cropping & Cutting!*\n${moments.length} viral vertical moments (9:16) FFmpeg se cut ho rahe hain...`).catch(() => {});

    const captionOptions: CaptionOptions = {
      style: job.captionStyle as any,
      position: job.captionPosition as any,
      fontSize: job.fontSize,
      maxWordsPerLine: job.maxWordsPerLine,
      language: job.captionLanguage as any,
    };

    const renderedClips = [];

    for (let i = 0; i < moments.length; i++) {
      const m = moments[i];
      const clipNumber = String(i + 1).padStart(2, "0");
      const subPath = path.join(storageDir, `sub_${clipNumber}.ass`);
      const clipOutputWithCap = path.join(publicClipsDir, `clip_${clipNumber}.mp4`);
      const clipOutputNoCap = path.join(publicClipsDir, `clip_${clipNumber}_nocap.mp4`);

      // Progress update per clip
      const stepPct = Math.round(65 + ((i + 1) / moments.length) * 30);
      await prisma.clipJob.update({
        where: { id: jobId },
        data: {
          progress: stepPct,
          currentStep: `Rendering clip ${i + 1} of ${moments.length}...`,
        },
      });

      // 1. Generate ASS Subtitles if autoCaptions is enabled
      let generatedSubPath: string | undefined = undefined;
      if (job.autoCaptions) {
        generatedSubPath = generateAssSubtitles(
          transcriptResult.segments,
          m.startTime,
          m.endTime,
          subPath,
          captionOptions,
          job.convertToShorts
        );
      }

      // 2. Render primary clip (with captions if enabled)
      await cutVideoClip(
        videoPath,
        m.startTime,
        m.duration,
        clipOutputWithCap,
        job.convertToShorts,
        generatedSubPath
      );

      // 3. Generate high-CTR viral thumbnail from the clip scene
      let webThumbPath: string | null = null;
      try {
        const thumbOutput = path.join(publicClipsDir, `thumb_${clipNumber}.jpg`);
        const thumbAss = path.join(storageDir, `thumb_${clipNumber}.ass`);

        await generateClipThumbnail(
          clipOutputWithCap,
          thumbOutput,
          thumbAss,
          m.title,
          m.clipIndex,
          job.convertToShorts,
          Math.min(2.5, m.duration / 3),
          m.startTime,
          m.duration
        );
        webThumbPath = `/clips/${jobId}/thumb_${clipNumber}.jpg`;
      } catch (thumbErr: any) {
        console.warn(`[Clipper] Thumbnail generation warning for clip ${clipNumber}:`, thumbErr.message);
      }

      // Public web-accessible paths (served by Next.js /public directory)
      const webPathWithCap = `/clips/${jobId}/clip_${clipNumber}.mp4`;

      const createdClip = await prisma.clip.create({
        data: {
          jobId: job.id,
          clipIndex: m.clipIndex,
          title: m.title,
          description: m.description,
          startTime: m.startTime,
          endTime: m.endTime,
          duration: m.duration,
          funScore: m.funScore,
          videoPath: webPathWithCap,
          noCaptionsPath: null,
          thumbnailPath: webThumbPath,
          hasCaptions: job.autoCaptions,
        },
      });

      renderedClips.push(createdClip);
    }

    // ----------------------------------------------------
    // STEP 5: CLEAN UP (ZERO-STORAGE GUARANTEE)
    // ----------------------------------------------------
    try {
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      if (fs.existsSync(storageDir)) {
        fs.rmSync(storageDir, { recursive: true, force: true });
      }
      console.log(`[Storage] Cleaned up source video & temp audio for job: ${jobId}`);
    } catch (cleanErr) {
      console.warn("Storage cleanup note:", cleanErr);
    }

    // ----------------------------------------------------
    // STEP 6: COMPLETED
    // ----------------------------------------------------
    await prisma.clipJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        progress: 100,
        currentStep: "All clips & viral thumbnails ready!",
      },
    });

    await logMessage(
      userId,
      "info",
      `[Clipper] Generated ${renderedClips.length} clips for "${job.videoTitle}"`
    );
    broadcastTelegramAlert(
      `🚀 *[Stage 6/6] All ${renderedClips.length} Shorts Ready!*\nClips 9:16 vertical + Hormozi captions ke sath ready hokar Upload Queue me daal diye gaye hain. Ab YouTube upload shuru ho raha hai! ✅`
    ).catch(() => {});
  } catch (err: any) {
    console.error("Clipper job error:", err);
    await prisma.clipJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error: err.message || "Clipping pipeline failed.",
        currentStep: "Failed",
      },
    });
    await logMessage(userId, "error", `[Clipper] Job failed: ${err.message}`);
  }
}
