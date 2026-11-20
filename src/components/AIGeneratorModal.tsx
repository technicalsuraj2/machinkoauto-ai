"use client";

import { useState } from "react";
import { Sparkles, Loader2, X, CheckCircle, Video, ArrowRight, Wand2 } from "lucide-react";

interface AIGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJobCreated?: () => void;
  onNotification?: (msg: string, type: "success" | "error" | "info") => void;
}

export default function AIGeneratorModal({
  isOpen,
  onClose,
  onJobCreated,
  onNotification,
}: AIGeneratorModalProps) {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [duration, setDuration] = useState<number>(5);
  const [style, setStyle] = useState("Cinematic");
  const [autoUpload, setAutoUpload] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const stylePresets = ["Cinematic", "Photorealistic", "Anime / Manga", "3D Animation", "Cyberpunk", "Vintage Retro"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          aspectRatio,
          duration,
          style,
          autoUpload,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to trigger AI video generation");
      }

      onNotification?.(
        "AI Generation started! The worker will render the video, save to Google Drive, and queue to YouTube.",
        "success"
      );
      setPrompt("");
      onJobCreated?.();
      onClose();
    } catch (err: any) {
      onNotification?.(err.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg text-white">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">AI Video Generator</h2>
              <p className="text-xs text-slate-400">Generate video from text and auto-pipe to YouTube</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1.5">Video Prompt</label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. A futuristic cyberpunk city at dusk with neon flying cars in ultra-high resolution..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs"
              required
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1.5">Aspect Ratio</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "16:9", label: "16:9 (Landscape / YouTube)" },
                { id: "9:16", label: "9:16 (Shorts / Reels)" },
                { id: "1:1", label: "1:1 (Square)" },
              ].map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setAspectRatio(item.id as any)}
                  className={`py-2 px-2 rounded-xl border text-center transition-all ${
                    aspectRatio === item.id
                      ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 font-semibold"
                      : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1.5">
                Duration: <span className="text-indigo-400">{duration} seconds</span>
              </label>
              <input
                type="range"
                min="3"
                max="15"
                step="1"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5">Style Preset</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {stylePresets.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="font-semibold text-white block">Auto-Upload to YouTube</span>
              <p className="text-[11px] text-slate-400">
                Saves to Drive ("AutoTube Studio/Generated") & queues to YouTube
              </p>
            </div>
            <input
              type="checkbox"
              checked={autoUpload}
              onChange={(e) => setAutoUpload(e.target.checked)}
              className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !prompt.trim()}
              className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-900/30 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  Generate Video
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
