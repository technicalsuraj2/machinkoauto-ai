import { spawn } from "child_process";
import fs from "fs";
import path from "path";

function escapeFilterPath(filePath: string): string {
  const rel = path.relative(process.cwd(), filePath);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
    return rel.replace(/\\/g, "/");
  }
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

const VIRAL_TOP_HOOKS = [
  "WAIT FOR THE END! 😱",
  "BRO REALLY DID THIS?! 🔥",
  "1000 IQ MOMENT ⚡",
  "YE KYA HO GAYA?! 🤯",
  "NEVER DO THIS! 💀",
  "TOP CRAZIEST SCENE ⚠️",
  "INSANE REACTION 🎯",
  "100% UNEXPECTED 💥",
  "WATCH TILL END! 🚀",
  "HE WAS NOT READY! 😂",
  "PURE MADNESS 🔥",
  "DON'T MISS THIS! 🛑",
];

const VIRAL_SUB_HOOKS = [
  "BRO WENT INSANE!",
  "NO WAY HE SURVIVED!",
  "BIGGEST WIN EVER!",
  "MOST VIRAL HIGHLIGHT!",
  "PURE CHAOS & FUN!",
  "CRAZIEST ENDING EVER!",
  "CANNOT UNSEE THIS!",
  "LEGENDARY MOMENT!",
  "TOTAL DISASTER 😂",
  "1 IN A MILLION LUCK!",
];

export function generateViralThumbnailHook(
  title: string,
  clipIndex: number
): { topHook: string; subHook: string } {
  const topIndex = (clipIndex - 1) % VIRAL_TOP_HOOKS.length;
  const topHook = VIRAL_TOP_HOOKS[topIndex];

  const cleanTitle = title.replace(/#Shorts|#shorts|#viral/gi, "").trim();
  const words = cleanTitle.split(/\s+/).filter((w) => w.length > 2);

  let subHook = VIRAL_SUB_HOOKS[(clipIndex - 1) % VIRAL_SUB_HOOKS.length];
  if (words.length >= 2 && words.length <= 4) {
    subHook = words.join(" ").toUpperCase() + " 🔥";
  }

  return { topHook, subHook };
}

function createThumbnailAss(
  assPath: string,
  topHook: string,
  subHook: string,
  isShorts: boolean = true
): string {
  const resX = isShorts ? 1080 : 1280;
  const resY = isShorts ? 1920 : 720;
  const topSize = isShorts ? 78 : 56;
  const subSize = isShorts ? 62 : 44;
  const topMargin = isShorts ? 240 : 80;
  const subMargin = isShorts ? 340 : 150;

  const content = `[Script Info]
Title: AutoTube Thumbnail Overlay
ScriptType: v4.00+
PlayResX: ${resX}
PlayResY: ${resY}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ThumbTop,Arial Black,${topSize},&H0000FFFF,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,7,5,8,40,40,${topMargin},1
Style: ThumbSub,Arial Black,${subSize},&H00FFFFFF,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,6,4,8,40,40,${subMargin},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:10.00,ThumbTop,,0,0,0,,{\\b1\\c&H0000FFFF&}${topHook}
Dialogue: 0,0:00:00.00,0:00:10.00,ThumbSub,,0,0,0,,{\\b1\\c&H00FFFFFF&}${subHook}
`;

  fs.writeFileSync(assPath, content, { encoding: "utf8" });
  return assPath;
}

/**
 * Generates an attractive, high-CTR viral thumbnail matching the YouTube Shorts reaction/split format
 */
export async function generateClipThumbnail(
  videoPath: string,
  outputPath: string,
  tempAssPath: string,
  title: string,
  clipIndex: number,
  isShorts: boolean = true,
  frameTimeSec: number = 2.5,
  startTime: number = 0,
  duration: number = 30
): Promise<string> {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 1. PRIMARY: High-Production Viral Split-Reaction Thumbnail (Pillow + FFmpeg Composite)
  const scriptPath = path.join(process.cwd(), "storage", "scripts", "generate_thumbnail.py");
  if (fs.existsSync(scriptPath)) {
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn("python", [
          scriptPath,
          videoPath,
          outputPath,
          title || "Viral Video",
          String(clipIndex),
          String(startTime),
          String(duration),
        ]);
        let stderr = "";
        proc.stderr.on("data", (d) => (stderr += d.toString()));
        proc.on("close", (code) => {
          if (code === 0 && fs.existsSync(outputPath)) {
            resolve();
          } else {
            reject(new Error(`Python thumbnail generator error (${code}): ${stderr}`));
          }
        });
        proc.on("error", reject);
      });

      return outputPath;
    } catch (pyErr: any) {
      console.warn("Python viral thumbnail generation warning, using FFmpeg fallback:", pyErr.message);
    }
  }

  // 2. FALLBACK: Direct FFmpeg subtitle-based thumbnail
  const { topHook, subHook } = generateViralThumbnailHook(title, clipIndex);
  createThumbnailAss(tempAssPath, topHook, subHook, isShorts);

  const escapedAss = escapeFilterPath(tempAssPath);
  const filter = `eq=contrast=1.12:saturation=1.22:brightness=0.02,unsharp=5:5:0.8:3:3:0.4,subtitles='${escapedAss}'`;

  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-ss",
      frameTimeSec.toFixed(2),
      "-i",
      videoPath,
      "-vf",
      filter,
      "-vframes",
      "1",
      "-q:v",
      "2",
      "-update",
      "1",
      outputPath,
    ];

    const proc = spawn("ffmpeg", args);
    let stderr = "";

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(`FFmpeg thumbnail generation failed (${code}): ${stderr}`)
        );
      }
      resolve(outputPath);
    });

    proc.on("error", (err) => reject(err));
  });
}
