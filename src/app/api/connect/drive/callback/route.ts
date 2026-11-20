import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/session";
import { getBaseUrl, handleOAuthCallback } from "@/lib/google";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const baseUrl = getBaseUrl();

  if (error) {
    return NextResponse.redirect(`${baseUrl}?error=${encodeURIComponent(`Drive auth error: ${error}`)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}?error=Missing+authorization+code`);
  }

  const sessionUserId = await getCurrentUserId();
  const userId = state || sessionUserId;

  if (!userId) {
    return NextResponse.redirect(`${baseUrl}?error=User+session+not+found`);
  }

  try {
    const callbackUri = `${baseUrl}/api/connect/drive/callback`;
    await handleOAuthCallback(code, "drive", userId, callbackUri);
    return NextResponse.redirect(`${baseUrl}?connected=drive`);
  } catch (err: any) {
    console.error("Drive callback failed:", err);
    return NextResponse.redirect(
      `${baseUrl}?error=${encodeURIComponent(err.message || "Failed to connect Google Drive")}`
    );
  }
}
