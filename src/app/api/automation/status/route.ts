import { NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import prisma from "@/lib/prisma";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  let settings = await prisma.automationSetting.findUnique({
    where: { userId },
  });

  if (!settings) {
    settings = await prisma.automationSetting.create({
      data: {
        userId,
        gapMinutes: 0,
        dailyLimit: 10,
        isRunning: false,
      },
    });
  }

  // Check 24-hour / Daily Quota Reset (Limit: 10 uploads per day)
  const nowDate = new Date();
  let shouldResetQuota = false;

  if (settings.lastUploadedAt) {
    const lastDate = new Date(settings.lastUploadedAt);
    const isDifferentDay = lastDate.toDateString() !== nowDate.toDateString();
    const isOlderThan24h = nowDate.getTime() - lastDate.getTime() >= 24 * 60 * 60 * 1000;
    if (isDifferentDay || isOlderThan24h) {
      shouldResetQuota = true;
    }
  }

  if (shouldResetQuota && (settings.todayUploadCount > 0 || settings.quotaPausedUntil)) {
    settings = await prisma.automationSetting.update({
      where: { userId },
      data: {
        todayUploadCount: 0,
        quotaPausedUntil: null,
      },
    });
  }

  // Count videos by status
  const [pending, uploading, uploaded, failed, paused, total] = await Promise.all([
    prisma.video.count({ where: { userId, status: "pending" } }),
    prisma.video.count({ where: { userId, status: "uploading" } }),
    prisma.video.count({ where: { userId, status: "uploaded" } }),
    prisma.video.count({ where: { userId, status: "failed" } }),
    prisma.video.count({ where: { userId, status: "paused" } }),
    prisma.video.count({ where: { userId } }),
  ]);

  // Find currently active uploading video if any
  const currentUploadingVideo = await prisma.video.findFirst({
    where: { userId, status: "uploading" },
    select: {
      id: true,
      title: true,
      fileName: true,
      progress: true,
      fileSize: true,
    },
  });

  return NextResponse.json({
    settings: {
      isRunning: settings.isRunning,
      gapMinutes: settings.gapMinutes,
      dailyLimit: settings.dailyLimit,
      lastUploadedAt: settings.lastUploadedAt,
      todayUploadCount: settings.todayUploadCount,
      quotaPausedUntil: settings.quotaPausedUntil,
    },
    activeVideo: currentUploadingVideo,
    counts: {
      pending,
      uploading,
      uploaded,
      failed,
      paused,
      total,
    },
  });
}
