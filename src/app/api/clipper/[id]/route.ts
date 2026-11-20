import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import prisma from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  const job =
    params.id === "latest"
      ? await prisma.clipJob.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
          include: {
            clips: {
              orderBy: { clipIndex: "asc" },
            },
          },
        })
      : await prisma.clipJob.findFirst({
          where: { id: params.id, userId },
          include: {
            clips: {
              orderBy: { clipIndex: "asc" },
            },
          },
        });

  if (!job) {
    return NextResponse.json({ error: "Clip job not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, job });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  const job = await prisma.clipJob.findFirst({
    where: { id: params.id, userId },
  });

  if (!job) {
    return NextResponse.json({ error: "Clip job not found" }, { status: 404 });
  }

  await prisma.clipJob.delete({
    where: { id: params.id },
  });

  return NextResponse.json({ success: true, message: "Job deleted" });
}
