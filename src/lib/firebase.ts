import prisma from "./prisma";

export interface FirebaseVideoRecord {
  videoId: string;
  youtubeId?: string;
  title: string;
  durationSec: number;
  uploadedAt: string;
  status: string;
  channelTitle?: string;
  source: string;
}

/**
 * Sync uploaded video details to Firebase Realtime Database or Firestore via clean REST API
 * (Works everywhere including Netlify, Vercel, Node without heavy native SDK issues)
 */
export async function syncVideoToFirebase(video: FirebaseVideoRecord): Promise<{ success: boolean; message: string }> {
  const dbUrl = process.env.FIREBASE_DATABASE_URL;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!dbUrl && !projectId) {
    console.log("[Firebase] Config not set yet. Video details cached in SQLite DB.");
    return {
      success: false,
      message: "Firebase credentials not configured yet. Set FIREBASE_DATABASE_URL in .env",
    };
  }

  try {
    if (dbUrl) {
      // Firebase Realtime Database REST endpoint
      const cleanUrl = dbUrl.replace(/\/$/, "");
      const res = await fetch(`${cleanUrl}/uploads/${video.videoId}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...video,
          syncedAt: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        throw new Error(`Firebase RTDB HTTP error: ${res.status}`);
      }
      console.log(`[Firebase] Successfully synced video "${video.title}" to RTDB!`);
      return { success: true, message: "Synced to Firebase Realtime Database" };
    } else if (projectId) {
      // Firestore REST API
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/youtube_uploads/${video.videoId}`;
      const fields: Record<string, any> = {
        title: { stringValue: video.title },
        durationSec: { integerValue: String(video.durationSec) },
        uploadedAt: { stringValue: video.uploadedAt },
        status: { stringValue: video.status },
        source: { stringValue: video.source },
      };
      if (video.youtubeId) fields.youtubeId = { stringValue: video.youtubeId };
      if (video.channelTitle) fields.channelTitle = { stringValue: video.channelTitle };

      const res = await fetch(firestoreUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });

      if (!res.ok) {
        throw new Error(`Firestore REST error: ${res.status}`);
      }
      console.log(`[Firebase] Successfully synced video "${video.title}" to Firestore!`);
      return { success: true, message: "Synced to Firebase Firestore" };
    }

    return { success: false, message: "No valid Firebase URL or Project ID found." };
  } catch (err: any) {
    console.warn("[Firebase] Sync warning:", err.message);
    return { success: false, message: err.message };
  }
}

/**
 * Get Firebase connection status
 */
export async function getFirebaseStatus(): Promise<{ configured: boolean; target: string; lastSyncCount: number }> {
  const dbUrl = process.env.FIREBASE_DATABASE_URL;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  const uploadedCount = await prisma.video.count({ where: { status: "uploaded" } });

  return {
    configured: Boolean(dbUrl || projectId),
    target: dbUrl ? "Realtime Database" : projectId ? `Firestore (${projectId})` : "Not Configured",
    lastSyncCount: uploadedCount,
  };
}
