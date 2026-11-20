import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import prisma from "@/lib/prisma";
import { logMessage } from "@/lib/logger";

interface VideoPayload {
  driveFileId: string;
  fileName: string;
  title: string;
  description?: string;
  tags?: string;
  privacy?: "private" | "unlisted" | "public";
  madeForKids?: boolean;
  fileSize?: string;
}

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  try {
    const body = await request.json();
    const items: VideoPayload[] = Array.isArray(body.videos) ? body.videos : [body];

    if (!items.length) {
      return NextResponse.json({ error: "No video items provided" }, { status: 400 });
    }

    // Get max order index for user
    const lastVideo = await prisma.video.findFirst({
      where: { userId },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });
    let currentOrder = lastVideo ? lastVideo.orderIndex + 1 : 0;

    const createdVideos = [];

    for (const item of items) {
      let title = (item.title || item.fileName.replace(/\.[^/.]+$/, "")).trim();
      let description = item.description || "";
      let tags = item.tags || "";

      const isShortLike =
        item.fileName.toLowerCase().includes("reel") ||
        item.fileName.toLowerCase().includes("short") ||
        title.toLowerCase().includes("#short");

      if (isShortLike) {
        if (!title.toLowerCase().includes("#short")) {
          title = `${title.slice(0, 88)} #Shorts`;
        }
        if (!description.toLowerCase().includes("#short")) {
          description = `${description}\n\n#Shorts #shorts #viralshorts`.trim();
        }
        if (!tags) {
          tags = "Shorts,shorts,viral,reel";
        }
      }

      const created = await prisma.video.create({
        data: {
          userId,
          driveFileId: item.driveFileId,
          fileName: item.fileName,
          title,
          description,
          tags,
          privacy: item.privacy || "public",
          madeForKids: Boolean(item.madeForKids),
          fileSize: item.fileSize || "",
          orderIndex: currentOrder++,
          status: "pending",
        },
      });
      createdVideos.push(created);
    }

    await logMessage(
      userId,
      "info",
      `Queued ${createdVideos.length} video(s) from Drive for automated upload`
    );

    return NextResponse.json({ success: true, count: createdVideos.length, videos: createdVideos });
  } catch (err: any) {
    console.error("Failed to save videos:", err);
    return NextResponse.json({ error: err.message || "Failed to save videos" }, { status: 500 });
  }
}
