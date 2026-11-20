import { NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import prisma from "@/lib/prisma";
import { logMessage } from "@/lib/logger";

export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  const updated = await prisma.automationSetting.update({
    where: { userId },
    data: { isRunning: false },
  });

  await logMessage(userId, "warn", "Automation queue paused by user");

  return NextResponse.json({ success: true, settings: updated });
}
