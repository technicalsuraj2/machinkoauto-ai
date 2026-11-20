import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getYoutubeClient } from "@/lib/google";

export async function GET() {
  try {
    let user = null;
    let completedCount = 0;
    let pendingCount = 0;
    let totalClips = 0;
    let setting: any = null;

    try {
      user = await prisma.user.findFirst({
        include: {
          connections: true,
          automationSettings: true,
        },
      });

      if (user) {
        setting = user.automationSettings;
        completedCount = await prisma.video.count({ where: { status: "completed" } });
        pendingCount = await prisma.video.count({ where: { status: "pending" } });
        totalClips = await prisma.clip.count();
      }
    } catch (dbErr: any) {
      console.warn("Prisma query warning:", dbErr.message);
    }

    let youtubeData: {
      connected: boolean;
      channelTitle?: string;
      subscriberCount?: string;
      videoCount?: string;
      viewCount?: string;
      recentUploads?: Array<{ id: string; title: string; publishedAt?: string; views?: number; likes?: number }>;
      error?: string;
    } = { connected: false };

    try {
      const yt = await getYoutubeClient(user?.id);
      const chRes = await yt.channels.list({
        part: ["snippet", "statistics", "contentDetails"],
        mine: true,
      });

      const ch = chRes.data.items?.[0];
      if (ch) {
        const uploadsPlaylistId = ch.contentDetails?.relatedPlaylists?.uploads;
        let recentUploads: Array<{ id: string; title: string; publishedAt?: string; views?: number; likes?: number }> = [];

        if (uploadsPlaylistId) {
          try {
            const plRes = await yt.playlistItems.list({
              part: ["snippet"],
              playlistId: uploadsPlaylistId,
              maxResults: 10,
            });
            const rawUploads = (plRes.data.items || []).map((item) => ({
              id: item.snippet?.resourceId?.videoId || "",
              title: item.snippet?.title || "Untitled Video",
              publishedAt: item.snippet?.publishedAt || "",
              views: 0,
              likes: 0,
            }));

            const videoIds = rawUploads.map((v) => v.id).filter(Boolean);
            if (videoIds.length > 0) {
              try {
                const vStatsRes = await yt.videos.list({
                  part: ["statistics"],
                  id: videoIds,
                });
                const statsMap = new Map();
                (vStatsRes.data.items || []).forEach((item) => {
                  statsMap.set(item.id, {
                    views: Number(item.statistics?.viewCount || 0),
                    likes: Number(item.statistics?.likeCount || 0),
                  });
                });
                recentUploads = rawUploads.map((v) => {
                  const s = statsMap.get(v.id) || { views: 0, likes: 0 };
                  return { ...v, views: s.views, likes: s.likes };
                });
              } catch {
                recentUploads = rawUploads;
              }
            } else {
              recentUploads = rawUploads;
            }
          } catch (plErr) {
            // playlist listing optional
          }
        }

        youtubeData = {
          connected: true,
          channelTitle: ch.snippet?.title || "My Channel",
          subscriberCount: ch.statistics?.subscriberCount || "0",
          videoCount: ch.statistics?.videoCount || "0",
          viewCount: ch.statistics?.viewCount || "0",
          recentUploads,
        };
      }
    } catch (ytErr: any) {
      youtubeData = {
        connected: false,
        error: ytErr.message,
      };
    }

    // Query Firebase Realtime Database
    let firebaseSyncedCount = 0;
    const fbUrl = process.env.FIREBASE_DATABASE_URL;
    if (fbUrl) {
      try {
        const fbRes = await fetch(`${fbUrl.replace(/\/$/, "")}/videos.json`, { cache: "no-store" });
        if (fbRes.ok) {
          const data = await fbRes.json();
          if (data && typeof data === "object") {
            firebaseSyncedCount = Object.keys(data).length;
          }
        }
      } catch (fbErr) {
        // Firebase check optional
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      youtube: youtubeData,
      database: {
        completedVideos: completedCount || firebaseSyncedCount,
        pendingVideos: pendingCount,
        totalClipsGenerated: totalClips || firebaseSyncedCount,
        todayUploadCount: setting?.todayUploadCount || (youtubeData.connected ? Math.min(Number(youtubeData.videoCount || 0), 10) : 0),
        dailyLimit: setting?.dailyLimit || 10,
        isAutomationRunning: setting?.isRunning ?? true,
        firebaseSyncedVideos: firebaseSyncedCount,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
