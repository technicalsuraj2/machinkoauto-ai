import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import prisma from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { gapMinutes, dailyLimit } = body;

    const updated = await prisma.automationSetting.upsert({
      where: { userId },
      update: {
        ...(gapMinutes !== undefined ? { gapMinutes: Math.max(0, Number(gapMinutes)) } : {}),
        ...(dailyLimit !== undefined ? { dailyLimit: Math.max(1, Math.min(50, Number(dailyLimit))) } : {}),
      },
      create: {
        userId,
        gapMinutes: gapMinutes !== undefined ? Number(gapMinutes) : 0,
        dailyLimit: dailyLimit ? Number(dailyLimit) : 20,
        isRunning: false,
      },
    });

    return NextResponse.json({ success: true, settings: updated });
  } catch (err: any) {
    console.error("Failed to update automation settings:", err);
    return NextResponse.json({ error: err.message || "Failed to update settings" }, { status: 500 });
  }
}
