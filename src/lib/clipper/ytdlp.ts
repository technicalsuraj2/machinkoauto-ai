import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { FetchVideoInfo } from "./types";

function getCookiesArg(): string[] {
  const cookiePath = process.env.YTDLP_COOKIES_PATH;
  if (cookiePath && fs.existsSync(cookiePath)) {
    return ["--cookies", cookiePath];
  }
  return [];
}

export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:v=|\/|youtu\.be\/|shorts\/)([0-9A-Za-z_-]{11})/);
  return m ? m[1] : null;
}

/**
 * Fetch video metadata instantly (~1-1.5s) using concurrent YouTube oEmbed & Watch Page regex,
 * with fast fallback.
 */
export async function fetchVideoMetadata(youtubeUrl: string): Promise<FetchVideoInfo> {
  if (!youtubeUrl || !youtubeUrl.trim()) {
    throw new Error("YouTube URL is required.");
  }

  const videoId = extractYouTubeId(youtubeUrl);
  if (!videoId) {
    throw new Error("Invalid YouTube URL. Please provide a valid youtube.com or youtu.be link.");
  }

  const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const defaultThumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  let title = "YouTube Video";
  let channelTitle = "YouTube Creator";
  let thumbnail = defaultThumb;
  let duration = 300; // default 5m fallback

  // Run oEmbed and Watch page fetch concurrently in parallel (< 1.5 seconds)
  await Promise.allSettled([
    // 1. Ultra-fast oEmbed (< 800ms) -> Title, Author, Thumbnail
    (async () => {
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const oembedRes = await fetch(oembedUrl, {
          signal: AbortSignal.timeout(4000),
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });

        if (oembedRes.ok) {
          const data = await oembedRes.json();
          if (data.title) title = data.title;
          if (data.author_name) channelTitle = data.author_name;
          if (data.thumbnail_url) thumbnail = data.thumbnail_url;
        }
      } catch (err: any) {
        console.warn("[FastMeta] oEmbed note:", err.message);
      }
    })(),

    // 2. Watch page HTML scrape (< 1.5s) -> Exact Duration & backup title
    (async () => {
      try {
        const watchRes = await fetch(cleanUrl, {
          signal: AbortSignal.timeout(4000),
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });

        if (watchRes.ok) {
          const html = await watchRes.text();
          // Extract lengthSeconds
          const mLen = html.match(/"lengthSeconds":"(\d+)"/);
          if (mLen && mLen[1]) {
            duration = parseInt(mLen[1], 10);
          }
          // Backup title if oEmbed didn't capture
          if (title === "YouTube Video") {
            const mTitle = html.match(/<title>(.*?) - YouTube<\/title>/);
            if (mTitle && mTitle[1]) {
              title = mTitle[1];
            }
          }
          // Backup author/channel
          if (channelTitle === "YouTube Creator") {
            const mAuthor = html.match(/"ownerChannelName":"([^"]+)"/);
            if (mAuthor && mAuthor[1]) {
              channelTitle = mAuthor[1];
            }
          }
        }
      } catch (err: any) {
        console.warn("[FastMeta] Watch page duration note:", err.message);
      }
    })(),
  ]);

  // If we have video details, return immediately!
  if (title && title !== "YouTube Video") {
    return {
      id: videoId,
      url: cleanUrl,
      title,
      thumbnail,
      duration,
      channelTitle,
      viewCount: 0,
    };
  }

  // 3. Fast fallback: yt-dlp with IPv4 & Node JS-runtime (max 4s timeout)
  const args = [
    "-m",
    "yt_dlp",
    "-4",
    "--js-runtimes",
    "node",
    "--dump-json",
    "--no-playlist",
    "--no-warnings",
    "--socket-timeout",
    "5",
    ...getCookiesArg(),
    cleanUrl,
  ];

  return new Promise((resolve) => {
    const proc = spawn("python", args);

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      proc.kill();
      resolve({
        id: videoId,
        url: cleanUrl,
        title,
        thumbnail,
        duration,
        channelTitle,
        viewCount: 0,
      });
    }, 4500);

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return resolve({
          id: videoId,
          url: cleanUrl,
          title,
          thumbnail,
          duration,
          channelTitle,
          viewCount: 0,
        });
      }

      try {
        const data = JSON.parse(stdout);
        resolve({
          id: data.id || videoId,
          url: cleanUrl,
          title: data.title || title,
          thumbnail: data.thumbnail || thumbnail,
          duration: Math.round(Number(data.duration || duration)),
          channelTitle: data.uploader || channelTitle,
          viewCount: Number(data.view_count || 0),
        });
      } catch {
        resolve({
          id: videoId,
          url: cleanUrl,
          title,
          thumbnail,
          duration,
          channelTitle,
          viewCount: 0,
        });
      }
    });
  });
}

/**
 * Download YouTube video (best mp4, max 480p/720p for fast 9:16 vertical crop)
 * and extract 16kHz mono audio for transcription
 */
export async function downloadYouTubeVideo(
  youtubeUrl: string,
  outputDir: string,
  onProgress?: (percent: number) => void
): Promise<{ videoPath: string; audioPath: string }> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const videoId = extractYouTubeId(youtubeUrl);
  const cleanUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : youtubeUrl.trim();

  const videoPath = path.join(outputDir, "source.mp4");
  const audioPath = path.join(outputDir, "audio.wav");

  // If already downloaded and valid in cache, reuse immediately
  if (fs.existsSync(videoPath) && fs.existsSync(audioPath) && fs.statSync(videoPath).size > 1000000) {
    if (onProgress) onProgress(100);
    return { videoPath, audioPath };
  }

  const downloadArgs = [
    "-m",
    "yt_dlp",
    "-4",
    "--js-runtimes",
    "node",
    "--no-playlist",
    "--no-warnings",
    "--socket-timeout",
    "15",
    "--retries",
    "5",
    ...getCookiesArg(),
    "-f",
    "bv*[height<=360][ext=mp4]+ba[ext=m4a]/b[height<=360]/bv*[height<=480][ext=mp4]+ba[ext=m4a]/b[height<=480]/bv*[height<=720]+ba/best",
    "-N",
    "4",
    "--buffer-size",
    "16K",
    "--merge-output-format",
    "mp4",
    "-o",
    videoPath,
    "--newline",
    cleanUrl,
  ];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("python", downloadArgs);

    let stallTimer: NodeJS.Timeout | null = null;
    let globalTimer: NodeJS.Timeout | null = null;

    // Reset stall timer on every chunk of data received
    const resetStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        proc.kill();
        reject(new Error("Video download stalled. No data received for 60 seconds."));
      }, 60000); // Only abort if ZERO bytes received for 60s
    };

    resetStallTimer();

    // Generous 15-minute global max timeout so even long videos complete naturally
    globalTimer = setTimeout(() => {
      proc.kill();
      reject(new Error("Video download reached maximum time limit (15 mins)."));
    }, 900000);

    proc.stdout.on("data", (chunk) => {
      resetStallTimer();
      const text = chunk.toString();
      const match = text.match(/\[download\]\s+([\d.]+)%/);
      if (match && onProgress) {
        const pct = parseFloat(match[1]);
        onProgress(Math.min(99, Math.round(pct)));
      }
    });

    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      resetStallTimer();
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (stallTimer) clearTimeout(stallTimer);
      if (globalTimer) clearTimeout(globalTimer);
      if (code !== 0) {
        return reject(new Error(`Download failed: ${stderr || "yt-dlp error"}`));
      }
      resolve();
    });

    proc.on("error", (err) => {
      if (stallTimer) clearTimeout(stallTimer);
      if (globalTimer) clearTimeout(globalTimer);
      reject(err);
    });
  });

  // Extract 16kHz WAV mono audio for Whisper using ffmpeg
  await new Promise<void>((resolve, reject) => {
    const ffmpegArgs = [
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      audioPath,
    ];

    const proc = spawn("ffmpeg", ffmpegArgs);
    let errOutput = "";
    proc.stderr.on("data", (chunk) => {
      errOutput += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Audio extraction failed: ${errOutput}`));
      }
      resolve();
    });
  });

  return { videoPath, audioPath };
}
