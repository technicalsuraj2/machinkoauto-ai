import { spawn } from "child_process";
import path from "path";
import { TranscribedSegment } from "./types";

// Standard Hindi Devanagari to Roman Hinglish character transliteration map
const DEVANAGARI_MAP: Record<string, string> = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
  "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
  "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh",
  "ष": "sh", "स": "s", "ह": "h",
  "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo",
  "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "्": "",
  "ं": "n", "ः": "h", "ँ": "n", "अ": "a", "आ": "aa",
  "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ए": "e",
  "ऐ": "ai", "ओ": "o", "औ": "au"
};

export function transliterateDevanagariToHinglish(text: string): string {
  // If no Devanagari characters, return as is
  if (!/[\u0900-\u097F]/.test(text)) return text;

  let result = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (DEVANAGARI_MAP[char] !== undefined) {
      result += DEVANAGARI_MAP[char];
    } else {
      result += char;
    }
  }
  return result;
}

export async function transcribeAudio(
  audioPath: string,
  language: string = "auto",
  modelSize?: string
): Promise<{ language: string; duration: number; segments: TranscribedSegment[] }> {
  const scriptPath = path.join(process.cwd(), "storage", "scripts", "transcribe.py");
  const model = modelSize || process.env.WHISPER_MODEL_SIZE || "tiny";

  const args = [scriptPath, audioPath, model, language];

  return new Promise((resolve, reject) => {
    const proc = spawn("python", args);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Transcription failed (${code}): ${stderr || stdout}`));
      }

      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON output found from transcription");
        }
        const data = JSON.parse(jsonMatch[0]);
        if (data.error) {
          return reject(new Error(`Transcription error: ${data.error}`));
        }

        // If Hinglish was requested, transliterate Devanagari text to Roman script
        if (language === "hinglish") {
          data.segments = data.segments.map((seg: TranscribedSegment) => ({
            ...seg,
            text: transliterateDevanagariToHinglish(seg.text),
            words: seg.words?.map((w) => ({
              ...w,
              word: transliterateDevanagariToHinglish(w.word),
            })),
          }));
        }

        resolve(data);
      } catch (err: any) {
        reject(new Error(`Failed to parse transcription output: ${stdout || stderr}`));
      }
    });
  });
}
