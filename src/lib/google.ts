import { google } from "googleapis";
import prisma from "./prisma";
import { decryptToken, encryptToken } from "./crypto";
import { logMessage } from "./logger";

export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
];

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export function getBaseUrl(): string {
  return process.env.NEXTAUTH_URL || "http://localhost:3000";
}

export function getOAuth2Client(customRedirectUri?: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = customRedirectUri || `${getBaseUrl()}/api/auth/callback/google`;

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generate Incremental Authorization URL for Google Drive
 */
export function getDriveAuthUrl(state?: string, promptSelect: boolean = true): string {
  const redirectUri = `${getBaseUrl()}/api/connect/drive/callback`;
  const oauth2Client = getOAuth2Client(redirectUri);

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: promptSelect ? "select_account consent" : "consent",
    scope: DRIVE_SCOPES,
    state: state || "",
    include_granted_scopes: true,
  });
}

/**
 * Generate Incremental Authorization URL for YouTube
 */
export function getYoutubeAuthUrl(state?: string, promptSelect: boolean = true): string {
  const redirectUri = `${getBaseUrl()}/api/connect/youtube/callback`;
  const oauth2Client = getOAuth2Client(redirectUri);

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: promptSelect ? "select_account consent" : "consent",
    scope: YOUTUBE_SCOPES,
    state: state || "",
    include_granted_scopes: true,
  });
}

/**
 * Exchange auth code for tokens and store encrypted refresh token
 */
export async function handleOAuthCallback(
  code: string,
  provider: "drive" | "youtube",
  userId: string,
  customRedirectUri: string
) {
  const oauth2Client = getOAuth2Client(customRedirectUri);
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    // If user already authorized without prompt=consent, check if we already have an existing token
    const existing = await prisma.connection.findUnique({
      where: { userId_provider: { userId, provider } },
    });

    if (!existing) {
      throw new Error(
        "No refresh token returned by Google. Please disconnect and reconnect with consent prompted."
      );
    }
  }

  let channelName: string | null = null;
  let channelId: string | null = null;

  // If this is YouTube, fetch the channel name and ID to show in UI
  if (provider === "youtube" && (tokens.access_token || tokens.refresh_token)) {
    try {
      oauth2Client.setCredentials(tokens);
      const youtube = google.youtube({ version: "v3", auth: oauth2Client });
      const channelRes = await youtube.channels.list({
        part: ["snippet", "id"],
        mine: true,
      });

      if (channelRes.data.items && channelRes.data.items.length > 0) {
        channelName = channelRes.data.items[0].snippet?.title || null;
        channelId = channelRes.data.items[0].id || null;
      }
    } catch (err: any) {
      console.warn("Failed to fetch YouTube channel info during connect:", err.message);
    }
  }

  const encryptedRefreshToken = tokens.refresh_token
    ? encryptToken(tokens.refresh_token)
    : undefined;

  // Use channelId in provider key for multiple YouTube channels support
  const providerKey = (provider === "youtube" && channelId) ? `youtube_${channelId}` : provider;

  const connection = await prisma.connection.upsert({
    where: {
      userId_provider: {
        userId,
        provider: providerKey,
      },
    },
    update: {
      ...(encryptedRefreshToken ? { encryptedRefreshToken } : {}),
      channelName: channelName || undefined,
      channelId: channelId || undefined,
      status: "connected",
      updatedAt: new Date(),
    },
    create: {
      userId,
      provider: providerKey,
      encryptedRefreshToken: encryptedRefreshToken || "",
      channelName,
      channelId,
      status: "connected",
    },
  });

  // Sync to Firebase RTDB for cloud automation runner
  const dbUrl = process.env.FIREBASE_DATABASE_URL || "https://ai-agent-24af3-default-rtdb.firebaseio.com";
  if (provider === "youtube" && channelId && tokens.refresh_token) {
    try {
      await fetch(`${dbUrl.replace(/\/$/, "")}/channels/${channelId}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId,
          channelName: channelName || "YouTube Channel",
          refreshToken: tokens.refresh_token,
          status: "connected",
          updatedAt: new Date().toISOString(),
        }),
      });
    } catch (e: any) {
      console.warn("[Firebase] Failed to sync channel to RTDB:", e.message);
    }
  } else if (provider === "drive" && tokens.refresh_token) {
    try {
      await fetch(`${dbUrl.replace(/\/$/, "")}/drive_config.json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refreshToken: tokens.refresh_token,
          status: "connected",
          updatedAt: new Date().toISOString(),
        }),
      });
    } catch (e: any) {
      console.warn("[Firebase] Failed to sync drive token to RTDB:", e.message);
    }
  }

  await logMessage(userId, "info", `Successfully connected ${provider.toUpperCase()}${channelName ? ` (${channelName})` : ""}`);

  return connection;
}

/**
 * Retrieve authenticated Google Drive API client for a user
 */
export async function getDriveClient(userId: string) {
  const connection = await prisma.connection.findUnique({
    where: { userId_provider: { userId, provider: "drive" } },
  });

  if (!connection || connection.status !== "connected") {
    throw new Error("Google Drive is not connected. Please connect Drive in settings.");
  }

  const refreshToken = decryptToken(connection.encryptedRefreshToken);
  const redirectUri = `${getBaseUrl()}/api/connect/drive/callback`;
  const oauth2Client = getOAuth2Client(redirectUri);

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.drive({ version: "v3", auth: oauth2Client });
}

/**
 * Retrieve authenticated YouTube API client for a user or cloud environment fallback
 */
export async function getYoutubeClient(userId?: string, targetChannelId?: string) {
  let refreshToken: string | null = null;

  if (userId) {
    try {
      if (targetChannelId) {
        const conn = await prisma.connection.findUnique({
          where: { userId_provider: { userId, provider: `youtube_${targetChannelId}` } },
        });
        if (conn && conn.status === "connected") {
          refreshToken = decryptToken(conn.encryptedRefreshToken);
        }
      }

      if (!refreshToken) {
        const conn = await prisma.connection.findFirst({
          where: {
            userId,
            provider: { startsWith: "youtube" },
            status: "connected",
          },
        });
        if (conn && conn.status === "connected") {
          refreshToken = decryptToken(conn.encryptedRefreshToken);
        }
      }
    } catch (err: any) {
      console.warn("Database lookup fallback to env:", err.message);
    }
  }

  if (!refreshToken && process.env.YOUTUBE_REFRESH_TOKEN) {
    refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  }

  if (!refreshToken) {
    throw new Error("YouTube is not connected. Please connect YouTube in settings.");
  }

  const redirectUri = `${getBaseUrl()}/api/connect/youtube/callback`;
  const oauth2Client = getOAuth2Client(redirectUri);

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.youtube({ version: "v3", auth: oauth2Client });
}

/**
 * Generate 1-click Google Calendar Web Reminder URL (Runs on any browser/device)
 */
export function getGoogleCalendarReminderUrl(): string {
  const text = encodeURIComponent("MachinkoAuto.Ai: Daily 10 YouTube Shorts Upload Reminder");
  const details = encodeURIComponent(
    "Automated Reminder: MachinkoAuto.Ai 24-hour cycle. AI automatically harvests 1 GTA 5 video (< 1 hr), cuts 10 viral Shorts with Hormozi captions & 9:16 vertical framing, and uploads 10 videos to YouTube."
  );
  // Recurring daily reminder with popup alert
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&details=${details}&recur=RRULE:FREQ=DAILY`;
}

/**
 * Programmatically create Google Calendar 24h Reminder event via Calendar API if user granted Calendar scope
 */
export async function createDailyCalendarEvent(
  userId: string,
  eventTitle: string = "MachinkoAuto.Ai: Daily 10 YouTube Shorts Upload"
): Promise<{ success: boolean; eventUrl: string; message: string }> {
  const defaultWebUrl = getGoogleCalendarReminderUrl();

  try {
    const connection = await prisma.connection.findFirst({
      where: { userId, status: "connected" },
    });

    if (!connection) {
      return {
        success: true,
        eventUrl: defaultWebUrl,
        message: "Calendar 1-click template prepared (open URL to save in your Google Calendar)",
      };
    }

    const refreshToken = decryptToken(connection.encryptedRefreshToken);
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const endHour = new Date(tomorrow.getTime() + 30 * 60 * 1000);

    const res = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: eventTitle,
        description: "MachinkoAuto.Ai 24-hour cycle reminder: 10 GTA 5 Shorts generated and uploaded to YouTube.",
        start: { dateTime: tomorrow.toISOString() },
        end: { dateTime: endHour.toISOString() },
        recurrence: ["RRULE:FREQ=DAILY"],
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 15 },
            { method: "email", minutes: 60 },
          ],
        },
      },
    });

    return {
      success: true,
      eventUrl: res.data.htmlLink || defaultWebUrl,
      message: "Daily recurring reminder created in Google Calendar!",
    };
  } catch (err: any) {
    console.warn("Calendar API direct insert note:", err.message);
    return {
      success: true,
      eventUrl: defaultWebUrl,
      message: "Direct API requires calendar scope; opened 1-click Google Calendar template.",
    };
  }
}
