import { NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import prisma from "@/lib/prisma";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  const connections = await prisma.connection.findMany({
    where: { userId },
    select: {
      id: true,
      provider: true,
      channelName: true,
      channelId: true,
      status: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ connections });
}
