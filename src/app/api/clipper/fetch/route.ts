import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import { fetchVideoMetadata } from "@/lib/clipper/ytdlp";

export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "YouTube URL is required" }, { status: 400 });
  }

  try {
    const info = await fetchVideoMetadata(url);
    const mins = Math.floor(info.duration / 60);
    const secs = (info.duration % 60).toString().padStart(2, "0");
    const durationFormatted = `${mins}:${secs}`;

    return NextResponse.json({
      success: true,
      ...info,
      durationFormatted,
      channel: info.channelTitle || "YouTube Creator",
      info,
    });
  } catch (err: any) {
    console.error("Fetch metadata error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch YouTube video metadata" },
      { status: 500 }
    );
  }
}
