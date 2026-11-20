import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import prisma from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  const clipId = params.id;
  const clip = await prisma.clip.findUnique({
    where: { id: clipId },
    include: { job: true },
  });

  if (!clip || clip.job.userId !== userId) {
    return NextResponse.json({ error: "Clip not found or unauthorized" }, { status: 404 });
  }

  const body = await request.json();
  const { title, description, hasCaptions } = body;

  const updated = await prisma.clip.update({
    where: { id: clipId },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(hasCaptions !== undefined ? { hasCaptions: Boolean(hasCaptions) } : {}),
    },
  });

  return NextResponse.json({ success: true, clip: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  const clipId = params.id;
  const clip = await prisma.clip.findUnique({
    where: { id: clipId },
    include: { job: true },
  });

  if (!clip || clip.job.userId !== userId) {
    return NextResponse.json({ error: "Clip not found or unauthorized" }, { status: 404 });
  }

  await prisma.clip.delete({
    where: { id: clipId },
  });

  return NextResponse.json({ success: true, message: "Clip deleted" });
}
