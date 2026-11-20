import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { ClipMoment, TranscribedSegment } from "./types";

interface LLMClipResponse {
  clipIndex?: number;
  startTime: number;
  endTime: number;
  funScore: number;
  title: string;
  description: string;
}

function getTargetLength(clipLength: string): { min: number; max: number; target: number } {
  switch (clipLength) {
    case "15s":
      return { min: 12, max: 18, target: 15 };
    case "30s":
      return { min: 25, max: 35, target: 30 };
    case "45s":
      return { min: 40, max: 50, target: 45 };
    case "60s":
      return { min: 50, max: 60, target: 58 };
    case "auto":
    default:
      return { min: 20, max: 55, target: 30 };
  }
}

/**
 * Run python audio RMS peak detection script
 */
async function detectAudioPeaks(
  audioPath: string,
  clipCount: number,
  targetLen: number
): Promise<{ peakSec: number; startTime: number; endTime: number; duration: number; energyScore: number }[]> {
  const scriptPath = path.join(process.cwd(), "storage", "scripts", "detect_peaks.py");
  if (!fs.existsSync(scriptPath) || !fs.existsSync(audioPath)) {
    return [];
  }

  return new Promise((resolve) => {
    const proc = spawn("python", [scriptPath, audioPath, String(clipCount), String(targetLen)]);
    let stdout = "";
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.on("error", () => resolve([]));
    proc.on("close", (code) => {
      if (code !== 0) return resolve([]);
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return resolve([]);
        const data = JSON.parse(jsonMatch[0]);
        if (data.success && Array.isArray(data.moments)) {
          return resolve(data.moments);
        }
      } catch {
        // Fallback
      }
      resolve([]);
    });
  });
}

/**
 * Intelligent moment detection prioritizing HIGH-ENERGY SOUND, LOUD REACTIONS & CRAZY SCENES
 */
export async function detectMoments(
  segments: TranscribedSegment[],
  totalDuration: number,
  clipCount: number,
  clipLength: string = "auto",
  videoTitle: string = "Video",
  audioPath?: string
): Promise<ClipMoment[]> {
  const { min, max, target } = getTargetLength(clipLength);

  // 1. Detect loudest audio energy peaks (screams, laughter, hype, explosions, crazy reactions)
  let peakCandidates: { peakSec: number; startTime: number; endTime: number; duration: number; energyScore: number }[] = [];
  if (audioPath && fs.existsSync(audioPath)) {
    try {
      peakCandidates = await detectAudioPeaks(audioPath, clipCount, target);
    } catch (peakErr: any) {
      console.warn("Audio peak analysis warning:", peakErr.message);
    }
  }

  // 2. Align peaks with natural speech sentence boundaries from transcription
  const candidateMoments: ClipMoment[] = [];

  if (peakCandidates.length > 0) {
    for (let i = 0; i < peakCandidates.length; i++) {
      const p = peakCandidates[i];
      let cStart = p.startTime;
      let cEnd = p.endTime;

      if (segments.length > 0) {
        // Find nearest sentence start within 8s before or after candidate start
        const startSeg = segments.find(
          (s) => s.start >= Math.max(0, p.startTime - 8) && s.start <= p.startTime + 8
        );
        if (startSeg) {
          cStart = startSeg.start;
        }

        // Find nearest sentence end within target range
        const endSeg = segments.find(
          (s) => s.end >= cStart + min && s.end <= cStart + max
        );
        if (endSeg) {
          cEnd = endSeg.end;
        } else {
          cEnd = Math.min(totalDuration, cStart + target);
        }
      }

      const dur = Math.round((cEnd - cStart) * 10) / 10;
      if (dur >= min && cEnd <= totalDuration) {
        // Find dialogue spoken in this peak
        const peakDialogue = segments
          .filter((s) => s.end >= cStart && s.start <= cEnd)
          .map((s) => s.text)
          .join(" ")
          .trim();

        // High-energy title based on peak words
        let momentTitle = `🔥 CRAZY MOMENT #${i + 1} - ${videoTitle.slice(0, 35)} #Shorts`;
        if (peakDialogue.length > 5) {
          const words = peakDialogue.split(/\s+/).slice(0, 6).join(" ");
          momentTitle = `😱 "${words}..." - ${videoTitle.slice(0, 30)} #Shorts`;
        }

        candidateMoments.push({
          clipIndex: i + 1,
          startTime: Math.round(cStart * 10) / 10,
          endTime: Math.round(cEnd * 10) / 10,
          duration: dur,
          funScore: p.energyScore || Math.floor(92 + Math.random() * 7),
          title: momentTitle,
          description: peakDialogue || `Loud high-energy highlight #${i + 1} from ${videoTitle}`,
        });
      }
    }
  }

  // Fallback if audio peaks didn't yield enough clips
  if (candidateMoments.length < clipCount) {
    const heuristic = generateHeuristicMoments(
      segments,
      totalDuration,
      clipCount - candidateMoments.length,
      min,
      max,
      target,
      videoTitle
    );
    candidateMoments.push(...heuristic);
  }

  // 3. Optional: Fast LLM Enhancement for Catchy Titles
  // Only send the concise candidate moments (not the whole transcript) to avoid 504 timeouts!
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || "https://api.bluesminds.com/v1";
  const model = process.env.LLM_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b";

  if (apiKey && candidateMoments.length > 0) {
    try {
      const refinedMoments = await enhanceTitlesWithLLM(
        candidateMoments,
        videoTitle,
        apiKey,
        baseUrl,
        model
      );
      if (refinedMoments && refinedMoments.length > 0) {
        return sanitizeMoments(refinedMoments, totalDuration, clipCount, min, max);
      }
    } catch (llmErr: any) {
      console.warn("LLM title enhancement skipped, using high-energy peak titles:", llmErr.message);
    }
  }

  return sanitizeMoments(candidateMoments, totalDuration, clipCount, min, max);
}

/**
 * Fast LLM call to turn loud peak moments into viral clickbait titles (takes < 2 seconds)
 */
async function enhanceTitlesWithLLM(
  moments: ClipMoment[],
  videoTitle: string,
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<ClipMoment[]> {
  const summary = moments
    .map((m, idx) => `Clip ${idx + 1} (${m.duration}s): Dialogue: "${m.description}"`)
    .join("\n");

  const prompt = `You are an expert viral editor.
Video: "${videoTitle}"
Candidate High-Energy Moments:
${summary}

Task:
For each clip, generate a viral, curiosity-inducing YouTube Shorts title (under 55 characters with emojis and #Shorts) and 1-line description.
Output ONLY a JSON array matching the moments:
[
  {
    "clipIndex": 1,
    "title": "CRAZY GTA 6 CRASH MOMENT 😱 #Shorts",
    "description": "He did NOT expect this to happen!"
  }
]`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 second strict timeout to keep clipper ultra-fast

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a viral YouTube Shorts editor. Output ONLY JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.6,
        max_tokens: 400,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) return moments;

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content || "";
    const cleaned = rawContent.replace(/<thought>[\s\S]*?<\/thought>/gi, "").trim();
    const jsonMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!jsonMatch) return moments;

    const parsed: { clipIndex: number; title: string; description: string }[] = JSON.parse(jsonMatch[0]);

    return moments.map((m, idx) => {
      const match = parsed.find((p) => p.clipIndex === idx + 1) || parsed[idx];
      return {
        ...m,
        title: match?.title || m.title,
        description: match?.description || m.description,
      };
    });
  } catch {
    clearTimeout(timeoutId);
    return moments;
  }
}

/**
 * Heuristic fallback moments generator
 */
function generateHeuristicMoments(
  segments: TranscribedSegment[],
  totalDuration: number,
  clipCount: number,
  minLen: number,
  maxLen: number,
  targetLen: number,
  videoTitle: string
): ClipMoment[] {
  const moments: ClipMoment[] = [];
  const count = Math.min(clipCount, Math.max(1, Math.floor(totalDuration / minLen)));
  const windowSize = totalDuration / count;

  for (let i = 0; i < count; i++) {
    const idealStart = i * windowSize + windowSize * 0.25;
    let clipStart = idealStart;
    let clipEnd = Math.min(totalDuration, idealStart + targetLen);

    if (segments.length > 0) {
      const startSeg = segments.find((s) => s.start >= idealStart - 10 && s.start <= idealStart + 15);
      if (startSeg) clipStart = startSeg.start;
      const endSeg = segments.find((s) => s.end >= clipStart + minLen && s.end <= clipStart + maxLen);
      if (endSeg) clipEnd = endSeg.end;
    }

    const duration = Math.round((clipEnd - clipStart) * 10) / 10;
    if (duration >= minLen && clipEnd <= totalDuration) {
      moments.push({
        clipIndex: i + 1,
        startTime: Math.round(clipStart * 10) / 10,
        endTime: Math.round(clipEnd * 10) / 10,
        duration,
        funScore: Math.floor(90 + Math.random() * 8),
        title: `🔥 INSANE MOMENT #${i + 1} - ${videoTitle.slice(0, 30)} #Shorts`,
        description: `Highlight clip #${i + 1} from ${videoTitle}`,
      });
    }
  }

  return moments;
}

/**
 * Clean up moments: prevent overlap and enforce duration limits
 */
function sanitizeMoments(
  moments: ClipMoment[],
  totalDuration: number,
  desiredCount: number,
  minLen: number,
  maxLen: number
): ClipMoment[] {
  moments.sort((a, b) => a.startTime - b.startTime);
  const clean: ClipMoment[] = [];

  for (const m of moments) {
    if (m.startTime < 0) m.startTime = 0;
    if (m.endTime > totalDuration) m.endTime = totalDuration;
    m.duration = Math.round((m.endTime - m.startTime) * 10) / 10;

    if (m.duration < minLen || m.duration > maxLen + 5) continue;

    if (clean.length > 0) {
      const last = clean[clean.length - 1];
      if (m.startTime < last.endTime - 2) {
        m.startTime = last.endTime + 1;
        m.duration = Math.round((m.endTime - m.startTime) * 10) / 10;
        if (m.duration < minLen) continue;
      }
    }

    clean.push(m);
    if (clean.length >= desiredCount) break;
  }

  // Guarantee exact clip count as selected by the user
  if (clean.length < desiredCount && totalDuration > minLen) {
    const step = Math.max(minLen, totalDuration / desiredCount);
    for (let i = 0; i < desiredCount && clean.length < desiredCount; i++) {
      const candidateStart = Math.min(totalDuration - minLen, Math.max(0, i * step));
      const candidateEnd = Math.min(totalDuration, candidateStart + minLen);
      const overlaps = clean.some(
        (c) => !(candidateEnd <= c.startTime || candidateStart >= c.endTime)
      );
      if (!overlaps || clean.length < desiredCount) {
        clean.push({
          clipIndex: clean.length + 1,
          startTime: Math.round(candidateStart * 10) / 10,
          endTime: Math.round(candidateEnd * 10) / 10,
          duration: Math.round((candidateEnd - candidateStart) * 10) / 10,
          funScore: Math.floor(90 + Math.random() * 8),
          title: `🔥 VIRAL MOMENT #${clean.length + 1} #Shorts`,
          description: `Highlight clip #${clean.length + 1} from video`,
        });
      }
    }
  }

  const exactClips = clean.slice(0, desiredCount);
  return exactClips.map((m, idx) => ({ ...m, clipIndex: idx + 1 }));
}
