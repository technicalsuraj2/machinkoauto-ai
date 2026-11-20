import { NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import { getYoutubeAuthUrl } from "@/lib/google";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  const authUrl = getYoutubeAuthUrl(userId);
  return NextResponse.redirect(authUrl);
}
