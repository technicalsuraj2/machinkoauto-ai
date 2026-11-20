import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import prisma from "@/lib/prisma";
import { getFirebaseStatus } from "@/lib/firebase";
import { getTelegramToken } from "@/lib/telegram";

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const firebase = await getFirebaseStatus();
    const telegramToken = getTelegramToken();
    const hasTelegram = Boolean(telegramToken);

    let setting = null;
    if (userId) {
      setting = await prisma.automationSetting.findUnique({
        where: { userId },
      });
    }

    return NextResponse.json({
      firebase: {
        configured: firebase.configured,
        target: firebase.target,
        lastSyncCount: firebase.lastSyncCount,
      },
      telegram: {
        configured: hasTelegram,
        botUsername: process.env.TELEGRAM_BOT_USERNAME || (hasTelegram ? "Connected" : "Not Configured"),
        chatIdSet: Boolean(process.env.TELEGRAM_CHAT_ID),
      },
      automation: {
        isRunning: Boolean(setting?.isRunning),
        dailyLimit: setting?.dailyLimit || 10,
        todayUploadCount: setting?.todayUploadCount || 0,
        lastUploadedAt: setting?.lastUploadedAt || null,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
