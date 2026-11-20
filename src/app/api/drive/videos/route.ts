import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import { getDriveClient } from "@/lib/google";

export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  const folderId = request.nextUrl.searchParams.get("folderId");

  try {
    const drive = await getDriveClient(userId);

    let query = "mimeType contains 'video/' and trashed = false";
    if (folderId && folderId.trim() !== "") {
      query += ` and '${folderId.replace(/'/g, "\\'")}' in parents`;
    }

    const res = await drive.files.list({
      q: query,
      fields: "files(id, name, mimeType, size, thumbnailLink, createdTime, videoMediaMetadata)",
      pageSize: 50,
      orderBy: "createdTime desc",
    });

    return NextResponse.json({ videos: res.data.files || [] });
  } catch (err: any) {
    console.error("Failed to list Drive videos:", err);
    return NextResponse.json(
      { error: err.message || "Failed to list videos from Google Drive" },
      { status: 500 }
    );
  }
}
