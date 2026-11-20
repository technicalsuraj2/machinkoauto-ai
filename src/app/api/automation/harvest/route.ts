import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import { runAutonomousDailyPipeline } from "@/lib/automation/autoSource";

export async function POST(request: NextRequest) {
  let userId = await getCurrentUserId();
  if (!userId) {
    const primary = await prisma.user.findFirst();
    userId = primary?.id || null;
  }
  if (!userId) return unauthorizedResponse();

  let clipCount = 10;
  let query = "gta 5 funny moments gameplay";
  try {
    const body = await request.json();
    if (body.clipCount) clipCount = Number(body.clipCount);
    if (body.query) query = String(body.query);
  } catch (e) {
    // optional body
  }

  // If clipCount not specified, default to remaining daily quota
  if (!clipCount || clipCount <= 0) {
    const setting = await prisma.automationSetting.findUnique({ where: { userId } });
    const today = setting?.todayUploadCount || 0;
    const limit = setting?.dailyLimit || 10;
    clipCount = Math.max(1, limit - today);
  }

  // Run in background and return immediate response so UI/caller doesn't hang or timeout
  runAutonomousDailyPipeline(userId, clipCount, query).catch((err) => {
    console.error("Background autonomous pipeline error:", err);
  });

  return NextResponse.json({
    success: true,
    clipCount,
    query,
    message: `Autonomous Pipeline started! AI is sourcing "${query}" and cutting ${clipCount} Shorts.`,
  });
}
