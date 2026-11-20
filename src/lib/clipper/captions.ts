import fs from "fs";
import path from "path";
import { CaptionOptions, TranscribedSegment, TranscribedWord } from "./types";

function formatAssTime(seconds: number): string {
  const safe = Math.max(0, isNaN(seconds) ? 0 : seconds);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const centis = Math.floor((safe % 1) * 100);

  const pad = (n: number, z = 2) => String(n).padStart(z, "0");
  return `${hrs}:${pad(mins)}:${pad(secs)}.${pad(centis)}`;
}

/**
 * Generate ASS subtitle file for a clip with styled captions and Shorts safe areas
 */
export function generateAssSubtitles(
  segments: TranscribedSegment[],
  clipStartTime: number,
  clipEndTime: number,
  outputPath: string,
  options: CaptionOptions,
  isShorts: boolean = true
): string {
  // Extract words that fall inside [clipStartTime, clipEndTime]
  const clipWords: TranscribedWord[] = [];

  for (const seg of segments) {
    if (seg.words && seg.words.length > 0) {
      for (const w of seg.words) {
        if (w.end >= clipStartTime && w.start <= clipEndTime) {
          clipWords.push({
            word: w.word,
            start: Math.max(0, w.start - clipStartTime),
            end: Math.min(clipEndTime - clipStartTime, w.end - clipStartTime),
          });
        }
      }
    } else if (seg.end >= clipStartTime && seg.start <= clipEndTime) {
      // Fallback: segment without word timestamps -> split into pseudo word timestamps
      const words = seg.text.split(/\s+/).filter(Boolean);
      const segStart = Math.max(0, seg.start - clipStartTime);
      const segEnd = Math.min(clipEndTime - clipStartTime, seg.end - clipStartTime);
      const duration = Math.max(0.5, segEnd - segStart);
      const step = duration / Math.max(1, words.length);

      words.forEach((w, idx) => {
        clipWords.push({
          word: w,
          start: segStart + idx * step,
          end: segStart + (idx + 1) * step,
        });
      });
    }
  }

  // Target canvas resolution
  const playResX = isShorts ? 1080 : 1920;
  const playResY = isShorts ? 1920 : 1080;

  // Font styling configuration
  const fontName =
    options.fontFamily ||
    (process.env.CAPTION_FONT_PATH
      ? path.basename(process.env.CAPTION_FONT_PATH, path.extname(process.env.CAPTION_FONT_PATH))
      : "Arial Black");

  // Alignment: 2 = Bottom, 5 = Center, 8 = Top
  let alignment = 2;
  if (options.position === "center") alignment = 5;
  if (options.position === "top") alignment = 8;

  // Safe area margin for Shorts bottom controls: 340px above bottom
  const marginV = isShorts
    ? options.position === "bottom"
      ? 340
      : options.position === "top"
      ? 260
      : 0
    : 80;

  // Primary Color: BGR in ASS format (&H00BBGGRR&)
  let primaryColor = "&H00FFFFFF&"; // White
  let outlineColor = "&H00000000&"; // Black
  let backColor = "&H80000000&";
  let outlineWidth = 4;
  let shadowDepth = 2;
  let borderStyle = 1; // 1 = outline + drop shadow, 3 = opaque box
  let baseFontSize = options.fontSize || (isShorts ? 52 : 36);

  switch (options.style) {
    case "hormozi":
      // Alex Hormozi style: Big uppercase, vibrant yellow base, neon green/cyan active punch
      primaryColor = "&H0000FFFF&"; // Vibrant Yellow
      outlineColor = "&H00000000&"; // Heavy black border
      outlineWidth = 7;
      shadowDepth = 4;
      baseFontSize = Math.round(baseFontSize * 1.15);
      break;

    case "beast_punch":
      // MrBeast style: Bold red & yellow split
      primaryColor = "&H002020FF&"; // Punchy Red/Orange
      outlineColor = "&H00000000&";
      outlineWidth = 6;
      shadowDepth = 3;
      baseFontSize = Math.round(baseFontSize * 1.1);
      break;

    case "neon_glow":
      // Cyber neon glow: Cyan with Magenta border
      primaryColor = "&H00FFFF00&"; // Cyan
      outlineColor = "&H00FF00FF&"; // Magenta glow
      outlineWidth = 5;
      shadowDepth = 3;
      break;

    case "sub_box":
      // Netflix / TikTok Subtitle Box style
      primaryColor = "&H00FFFFFF&";
      outlineColor = "&H00000000&";
      backColor = "&HB0000000&"; // Dark rounded backdrop box
      borderStyle = 3; // Opaque box pill
      outlineWidth = 2;
      shadowDepth = 0;
      baseFontSize = Math.round(baseFontSize * 0.95);
      break;

    case "comic_pop":
      // Comic book bouncy yellow
      primaryColor = "&H0000E5FF&"; // Bright Amber Yellow
      outlineColor = "&H00000000&";
      outlineWidth = 6;
      shadowDepth = 3;
      break;

    case "bold_yellow":
      primaryColor = "&H0000FFFF&"; // Vibrant Yellow
      outlineColor = "&H00000000&";
      outlineWidth = 6;
      shadowDepth = 3;
      break;

    case "karaoke":
      primaryColor = "&H00FFFFFF&"; // White base, karaoke highlights
      outlineColor = "&H00000000&";
      outlineWidth = 5;
      shadowDepth = 2;
      break;

    case "minimal":
      primaryColor = "&H00F0F0F0&";
      outlineColor = "&H00202020&";
      outlineWidth = 2;
      shadowDepth = 1;
      baseFontSize = Math.round(baseFontSize * 0.85);
      break;

    case "classic":
    default:
      primaryColor = "&H00FFFFFF&";
      outlineColor = "&H00000000&";
      outlineWidth = 4;
      shadowDepth = 2;
      break;
  }

  // Header
  let assContent = `[Script Info]
Title: AutoTube Auto-Captions
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${baseFontSize},${primaryColor},&H000000FF,${outlineColor},${backColor},-1,0,0,0,100,100,0,0,${borderStyle},${outlineWidth},${shadowDepth},${alignment},40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Group words into lines of maxWordsPerLine
  const maxWords = options.maxWordsPerLine || 3;
  const lines: { words: TranscribedWord[]; start: number; end: number }[] = [];

  for (let i = 0; i < clipWords.length; i += maxWords) {
    const chunk = clipWords.slice(i, i + maxWords);
    if (chunk.length > 0) {
      lines.push({
        words: chunk,
        start: chunk[0].start,
        end: chunk[chunk.length - 1].end,
      });
    }
  }

  // Generate dialogue events
  for (const line of lines) {
    const isAnimatedStyle = ["karaoke", "hormozi", "neon_glow", "beast_punch", "comic_pop"].includes(options.style);

    if (isAnimatedStyle) {
      // Sub-interval active word highlight
      for (let wIdx = 0; wIdx < line.words.length; wIdx++) {
        const curWord = line.words[wIdx];
        const nextWord = line.words[wIdx + 1];
        const wStart = formatAssTime(curWord.start);
        const wEnd = formatAssTime(nextWord ? nextWord.start : curWord.end);

        // Highlight tags per style
        let activeTag = "{\\c&H0000FF00&\\b1\\fscx112\\fscy112}"; // Default Green pop
        let baseTag = "{\\c&H00FFFFFF&}";

        if (options.style === "hormozi") {
          activeTag = "{\\c&H0000FF00&\\b1\\fscx115\\fscy115}"; // Green Pop
          baseTag = "{\\c&H0000FFFF&}"; // Yellow Base
        } else if (options.style === "neon_glow") {
          activeTag = "{\\c&H0000FFFF&\\b1\\fscx112\\fscy112}"; // Yellow Pop
          baseTag = "{\\c&H00FFFF00&}"; // Cyan Base
        } else if (options.style === "beast_punch") {
          activeTag = "{\\c&H0000FFFF&\\b1\\fscx115\\fscy115}"; // Yellow Pop
          baseTag = "{\\c&H003030FF&}"; // Red/Orange Base
        } else if (options.style === "comic_pop") {
          activeTag = "{\\c&H0000FFFF&\\b1}"; // Yellow Pop
          baseTag = "{\\c&H00FFFFFF&}";
        } else {
          // karaoke
          activeTag = "{\\c&H00FFFF00&\\b1}"; // Cyan highlight
          baseTag = "{\\c&H00FFFFFF&}";
        }

        const formattedWords = line.words.map((w, idx) => {
          const displayWord = options.style === "hormozi" ? w.word.toUpperCase() : w.word;
          if (idx === wIdx) {
            return `${activeTag}${displayWord}{\\r}`;
          }
          return `${baseTag}${displayWord}{\\r}`;
        });

        assContent += `Dialogue: 0,${wStart},${wEnd},Default,,0,0,0,,${formattedWords.join(" ")}\n`;
      }
    } else {
      // Standard line caption
      const startTime = formatAssTime(line.start);
      const endTime = formatAssTime(line.end);
      const text = line.words
        .map((w) => (options.style === "hormozi" ? w.word.toUpperCase() : w.word))
        .join(" ");
      assContent += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${text}\n`;
    }
  }

  fs.writeFileSync(outputPath, assContent, "utf8");
  return outputPath;
}
