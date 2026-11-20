import { NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import prisma from "@/lib/prisma";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  const videos = await prisma.video.findMany({
    where: { userId },
    orderBy: { orderIndex: "asc" },
  });

  return NextResponse.json({ videos });
}
