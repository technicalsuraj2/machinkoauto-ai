import { NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import prisma from "@/lib/prisma";
import { logMessage } from "@/lib/logger";

export async function POST() {
  let userId = await getCurrentUserId();
  if (!userId) {
    const primary = await prisma.user.findFirst();
    userId = primary?.id || null;
  }
  if (!userId) return unauthorizedResponse();

  // Verify Drive and YouTube connections exist
  const connections = await prisma.connection.findMany({
    where: { userId, status: "connected" },
  });

  const hasDrive = connections.some((c) => c.provider === "drive");
  const hasYoutube = connections.some((c) => c.provider === "youtube");

  if (!hasDrive || !hasYoutube) {
    return NextResponse.json(
      {
        error: `Both Google Drive and YouTube must be connected before starting automation. Missing: ${
          !hasDrive ? "Google Drive " : ""
        }${!hasYoutube ? "YouTube" : ""}`,
      },
      { status: 400 }
    );
  }

  // Set any paused videos back to pending
  await prisma.video.updateMany({
    where: { userId, status: "paused" },
    data: { status: "pending" },
  });

  const updated = await prisma.automationSetting.upsert({
    where: { userId },
    update: { isRunning: true, lastUploadedAt: null },
    create: { userId, isRunning: true, gapMinutes: 0, dailyLimit: 20 },
  });

  await logMessage(userId, "info", "Automation queue started by user");

  return NextResponse.json({ success: true, settings: updated });
}
