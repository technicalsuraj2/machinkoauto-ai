import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import prisma from "@/lib/prisma";
import { logMessage } from "@/lib/logger";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  const provider = params.provider;
  if (provider !== "drive" && !provider.startsWith("youtube")) {
    return NextResponse.json({ error: "Invalid provider specified" }, { status: 400 });
  }

  try {
    await prisma.connection.deleteMany({
      where: {
        userId,
        provider,
      },
    });
  } catch (e: any) {
    console.warn("Delete connection warning:", e.message);
  }

  // Remove channel from Firebase RTDB if applicable
  if (provider.startsWith("youtube")) {
    const channelId = provider.replace(/^youtube_?/, "");
    if (channelId) {
      try {
        const dbUrl = process.env.FIREBASE_DATABASE_URL || "https://ai-agent-24af3-default-rtdb.firebaseio.com";
        await fetch(`${dbUrl.replace(/\/$/, "")}/channels/${channelId}.json`, { method: "DELETE" });
      } catch (e: any) {
        console.warn("[Firebase] Remove channel warning:", e.message);
      }
    }
  }

  await logMessage(userId, "warn", `Disconnected ${provider.toUpperCase()}`);

  return NextResponse.json({ success: true, message: `Disconnected ${provider}` });
}
