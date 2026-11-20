import { NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import { getDriveClient } from "@/lib/google";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  try {
    const drive = await getDriveClient(userId);

    const res = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: "files(id, name, modifiedTime)",
      pageSize: 50,
      orderBy: "name asc",
    });

    return NextResponse.json({ folders: res.data.files || [] });
  } catch (err: any) {
    console.error("Failed to list Drive folders:", err);
    return NextResponse.json(
      { error: err.message || "Failed to list folders from Google Drive" },
      { status: 500 }
    );
  }
}
