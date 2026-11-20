import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import prisma from "@/lib/prisma";
import { logMessage } from "@/lib/logger";
import path from "path";

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  try {
    const body = await request.json();
    const clipIds: string[] = body.clipIds || (body.clipId ? [body.clipId] : []);
    const titleTemplate: string | undefined = body.titleTemplate;
    const descriptionTemplate: string | undefined = body.descriptionTemplate;

    if (!clipIds.length) {
      return NextResponse.json({ error: "No clips selected" }, { status: 400 });
    }

    const clips = await prisma.clip.findMany({
      where: {
        id: { in: clipIds },
        job: { userId },
      },
      include: { job: true },
      orderBy: { clipIndex: "asc" },
    });

    if (!clips.length) {
      return NextResponse.json({ error: "Clips not found" }, { status: 404 });
    }

    // Get current max order index for user
    const lastVideo = await prisma.video.findFirst({
      where: { userId },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });
    let currentOrder = lastVideo ? lastVideo.orderIndex + 1 : 0;

    const queuedVideos = [];

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];

      // Determine which video path to use (with captions vs without captions)
      const relativePath =
        !clip.hasCaptions && clip.noCaptionsPath ? clip.noCaptionsPath : clip.videoPath;
      const absoluteLocalPath = path.join(process.cwd(), "public", relativePath.replace(/^\//, ""));

      // Determine thumbnail path (web URL path /clips/... for browser preview)
      const webThumbnailPath = clip.thumbnailPath || null;

      // Process title with {n} placeholder if provided
      let finalTitle = clip.title;
      if (titleTemplate && titleTemplate.trim()) {
        finalTitle = titleTemplate.replace(/\{n\}/gi, String(clip.clipIndex));
      }
      if (clip.duration <= 60 && !finalTitle.toLowerCase().includes("#short")) {
        finalTitle = `${finalTitle.slice(0, 91)} #Shorts`;
      }

      // Process description with {n} placeholder if provided
      let finalDesc = clip.description || "";
      if (descriptionTemplate && descriptionTemplate.trim()) {
        finalDesc = descriptionTemplate.replace(/\{n\}/gi, String(clip.clipIndex));
      }
      if (clip.duration <= 60 && !finalDesc.toLowerCase().includes("#short")) {
        finalDesc = `${finalDesc}\n\n#Shorts #shorts #viralshorts`.trim();
      }

      const video = await prisma.video.create({
        data: {
          userId,
          driveFileId: `local:${relativePath}`,
          localPath: absoluteLocalPath,
          thumbnailPath: webThumbnailPath,
          fileName: path.basename(absoluteLocalPath),
          title: finalTitle,
          description: finalDesc,
          tags: "Shorts,shorts,viral,clipping,highlights",
          privacy: "public",
          madeForKids: false,
          fileSize: `${Math.round(clip.duration)}s`,
          orderIndex: currentOrder++,
          status: "pending",
        },
      });

      await prisma.clip.update({
        where: { id: clip.id },
        data: { isQueued: true },
      });

      queuedVideos.push(video);
    }

    await logMessage(
      userId,
      "info",
      `Queued ${queuedVideos.length} AI clip(s) for autonomous YouTube upload`
    );

    return NextResponse.json({ success: true, count: queuedVideos.length, videos: queuedVideos });
  } catch (err: any) {
    console.error("Queue clips error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to add clips to queue" },
      { status: 500 }
    );
  }
}
