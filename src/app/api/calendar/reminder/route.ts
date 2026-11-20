import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import { createDailyCalendarEvent, getGoogleCalendarReminderUrl } from "@/lib/google";

export async function GET(request: NextRequest) {
  const reminderUrl = getGoogleCalendarReminderUrl();
  return NextResponse.json({ url: reminderUrl });
}

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  try {
    const result = await createDailyCalendarEvent(userId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({
      success: true,
      eventUrl: getGoogleCalendarReminderUrl(),
      message: err.message || "Opened 1-click Google Calendar template",
    });
  }
}
