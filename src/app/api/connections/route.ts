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

  // Also merge any connected channels from Firebase RTDB
  try {
    const dbUrl = process.env.FIREBASE_DATABASE_URL || "https://ai-agent-24af3-default-rtdb.firebaseio.com";
    const fbRes = await fetch(`${dbUrl.replace(/\/$/, "")}/channels.json`, { cache: "no-store" });
    if (fbRes.ok) {
      const fbChannels = await fbRes.json();
      if (fbChannels && typeof fbChannels === "object") {
        for (const [chId, chData] of Object.entries<any>(fbChannels)) {
          if (!chData) continue;
          const exists = connections.some((c) => c.channelId === chId || c.provider === `youtube_${chId}`);
          if (!exists) {
            connections.push({
              id: `fb_${chId}`,
              provider: `youtube_${chId}`,
              channelName: chData.channelName || "Connected YouTube Channel",
              channelId: chId,
              status: chData.status || "connected",
              updatedAt: chData.updatedAt ? new Date(chData.updatedAt) : new Date(),
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn("Failed to merge Firebase channels:", err);
  }

  return NextResponse.json({ connections });
}
