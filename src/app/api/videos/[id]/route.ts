import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import prisma from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  try {
    const videoId = params.id;
    const body = await request.json();

    // Verify ownership
    const existing = await prisma.video.findFirst({
      where: { id: videoId, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Video not found or access denied" }, { status: 404 });
    }

    const updated = await prisma.video.update({
      where: { id: videoId },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
        ...(body.privacy !== undefined ? { privacy: body.privacy } : {}),
        ...(body.madeForKids !== undefined ? { madeForKids: Boolean(body.madeForKids) } : {}),
        ...(body.orderIndex !== undefined ? { orderIndex: Number(body.orderIndex) } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
    });

    return NextResponse.json({ success: true, video: updated });
  } catch (err: any) {
    console.error("Failed to update video:", err);
    return NextResponse.json({ error: err.message || "Failed to update video" }, { status: 500 });
  }
}

import fs from "fs";
import path from "path";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  try {
    const videoId = params.id;

    const existing = await prisma.video.findFirst({
      where: { id: videoId, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Video not found or access denied" }, { status: 404 });
    }

    // Zero-Storage: Clean up local files and thumbnail from disk if present
    if (existing.localPath && fs.existsSync(existing.localPath)) {
      try {
        fs.unlinkSync(existing.localPath);
        const noCap = existing.localPath.replace(".mp4", "_nocap.mp4");
        if (fs.existsSync(noCap)) fs.unlinkSync(noCap);
      } catch {}
    }
    if (existing.thumbnailPath) {
      let absThumb = existing.thumbnailPath;
      if (!fs.existsSync(absThumb)) {
        absThumb = path.join(process.cwd(), "public", existing.thumbnailPath.replace(/^\//, ""));
      }
      if (fs.existsSync(absThumb)) {
        try { fs.unlinkSync(absThumb); } catch {}
      }
    }

    await prisma.video.delete({
      where: { id: videoId },
    });

    return NextResponse.json({ success: true, message: "Video removed from queue and disk" });
  } catch (err: any) {
    console.error("Failed to delete video:", err);
    return NextResponse.json({ error: err.message || "Failed to delete video" }, { status: 500 });
  }
}
