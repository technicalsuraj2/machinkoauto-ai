import { NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import { getDriveAuthUrl } from "@/lib/google";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  // Pass userId in state so callback knows who to attach tokens to
  const authUrl = getDriveAuthUrl(userId);
  return NextResponse.redirect(authUrl);
}
