import { spawn } from "child_process";
import fs from "fs";
import path from "path";

function escapeFilterPath(filePath: string): string {
  // Prefer relative path from cwd to avoid Windows drive colon escaping issues
  const rel = path.relative(process.cwd(), filePath);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
    return rel.replace(/\\/g, "/");
  }
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

/**
 * Cuts a video clip and optionally converts to 9:16 Shorts with blurred background + burns in ASS captions
 */
export async function cutVideoClip(
  sourceVideoPath: string,
  startTime: number,
  duration: number,
  outputPath: string,
  convertToShorts: boolean = true,
  assSubtitlePath?: string
): Promise<string> {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    // Build filter complex
    let filterGraph = "";

    if (convertToShorts) {
      // 9:16 vertical with fast downscaled ambient blur + centered scaled foreground
      filterGraph =
        "[0:v]split=2[bg][fg];" +
        "[bg]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=10:2,scale=1080:1920[bgblur];" +
        "[fg]scale=1080:1920:force_original_aspect_ratio=decrease[fgscaled];" +
        "[bgblur][fgscaled]overlay=(W-w)/2:(H-h)/2";

      if (assSubtitlePath && fs.existsSync(assSubtitlePath)) {
        const escapedSub = escapeFilterPath(assSubtitlePath);
        filterGraph += `,ass='${escapedSub}'`;
      }
      filterGraph += "[v]";
    } else {
      if (assSubtitlePath && fs.existsSync(assSubtitlePath)) {
        const escapedSub = escapeFilterPath(assSubtitlePath);
        filterGraph = `ass='${escapedSub}'`;
      }
    }

    const ffmpegArgs = [
      "-y",
      "-threads",
      "0",
      "-ss",
      startTime.toFixed(2),
      "-t",
      duration.toFixed(2),
      "-i",
      sourceVideoPath,
    ];

    if (filterGraph) {
      if (convertToShorts) {
        ffmpegArgs.push("-filter_complex", filterGraph, "-map", "[v]", "-map", "0:a?");
      } else {
        ffmpegArgs.push("-vf", filterGraph);
      }
    }

    ffmpegArgs.push(
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "22",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputPath
    );

    const proc = spawn("ffmpeg", ffmpegArgs);
    let stderr = "";

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`FFmpeg clip rendering failed (${code}): ${stderr}`));
      }
      resolve(outputPath);
    });
  });
}
