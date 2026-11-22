import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  try {
    const dbUrl = process.env.FIREBASE_DATABASE_URL || "https://ai-agent-24af3-default-rtdb.firebaseio.com";
    const res = await fetch(`${dbUrl.replace(/\/$/, "")}/drive_config.json`, { cache: "no-store" });
    if (res.ok) {
      const config = await res.json();
      return NextResponse.json({ config: config || {} });
    }
    return NextResponse.json({ config: {} });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { folderId, folderName } = body;

    const dbUrl = process.env.FIREBASE_DATABASE_URL || "https://ai-agent-24af3-default-rtdb.firebaseio.com";
    const res = await fetch(`${dbUrl.replace(/\/$/, "")}/drive_config.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        folderId: folderId || "",
        folderName: folderName || "5,000 Videos Folder",
        updatedAt: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      throw new Error(`Firebase update failed with status ${res.status}`);
    }

    return NextResponse.json({ success: true, folderId, folderName });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
