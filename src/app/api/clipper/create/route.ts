import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import prisma from "@/lib/prisma";
import { extractYouTubeId } from "@/lib/clipper/ytdlp";

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  try {
    const body = await request.json();
    const rawUrl = body.youtubeUrl || body.url;
    if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
      return NextResponse.json({ error: "YouTube URL is required" }, { status: 400 });
    }

    const videoId = extractYouTubeId(rawUrl);
    if (!videoId) {
      return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
    }
    const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const videoTitle = body.videoTitle || body.title || "YouTube Video";
    const videoThumbnail = body.videoThumbnail || body.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const videoDuration = Number(body.videoDuration || body.duration) || 0;
    const clipCount = Math.max(1, Math.min(20, Number(body.clipCount) || 3));
    const clipLength = body.clipLength || "auto";
    const convertToShorts = body.convertToShorts !== undefined ? Boolean(body.convertToShorts) : true;
    const autoCaptions = body.autoCaptions !== undefined ? Boolean(body.autoCaptions) : true;

    const captionOptions = body.captionOptions || {};
    const captionLanguage = body.captionLanguage || captionOptions.language || "auto";
    const captionStyle = body.captionStyle || captionOptions.style || "karaoke";
    const captionPosition = body.captionPosition || captionOptions.position || "bottom";
    const fontSize = Number(body.fontSize || captionOptions.fontSize) || 24;
    const maxWordsPerLine = Number(body.maxWordsPerLine || captionOptions.maxWordsPerLine) || 3;
    const deleteOriginal = Boolean(body.deleteOriginal);

    const job = await prisma.clipJob.create({
      data: {
        userId,
        youtubeUrl: cleanUrl,
        videoTitle,
        videoThumbnail,
        videoDuration,
        clipCount,
        clipLength,
        convertToShorts,
        autoCaptions,
        captionLanguage,
        captionStyle,
        captionPosition,
        fontSize,
        maxWordsPerLine,
        deleteOriginal,
        status: "pending",
        progress: 0,
        currentStep: "Job queued in background...",
      },
    });

    return NextResponse.json({ success: true, job });
  } catch (err: any) {
    console.error("Create clip job error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create clipping job" },
      { status: 500 }
    );
  }
}
