"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Scissors,
  X,
  Play,
  Sparkles,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  Layers,
  Subtitles,
  Smartphone,
  Trash2,
  Plus,
  RefreshCw,
  Sliders,
  Type,
  Eye,
  Check,
  Film,
  ExternalLink,
  ChevronRight,
  Flame,
  Link as LinkIcon,
  Image as ImageIcon,
} from "lucide-react";

export interface ClipItem {
  id: string;
  clipIndex: number;
  startTime: number;
  endTime: number;
  duration: number;
  funScore: number;
  title: string;
  description: string;
  videoPath: string;
  noCaptionsPath?: string | null;
  thumbnailPath?: string | null;
  hasCaptions: boolean;
  isQueued: boolean;
}

export interface ClipJobData {
  id: string;
  status: "pending" | "downloading" | "transcribing" | "analyzing" | "cutting" | "captioning" | "completed" | "failed";
  progress: number;
  currentStep?: string | null;
  currentStage?: string | null;
  error?: string | null;
  youtubeUrl: string;
  videoTitle: string;
  videoThumbnail?: string | null;
  videoDuration: number;
  clipCount: number;
  convertToShorts: boolean;
  autoCaptions: boolean;
  captionStyle: string;
  clips: ClipItem[];
}

interface ClipperModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialUrl?: string;
  onClipsQueued?: () => void;
  onNotification?: (msg: string, type: "success" | "error" | "info") => void;
}

export default function ClipperModal({
  isOpen,
  onClose,
  initialUrl,
  onClipsQueued,
  onNotification,
}: ClipperModalProps) {
  // Input & Fetch States
  const [url, setUrl] = useState(initialUrl || "");
  const [isFetching, setIsFetching] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  // Sync initialUrl when modal opens
  useEffect(() => {
    if (isOpen && initialUrl && initialUrl.trim()) {
      setUrl(initialUrl);
    }
  }, [isOpen, initialUrl]);

  const [videoMeta, setVideoMeta] = useState<{
    title: string;
    thumbnail: string;
    duration: number;
    durationFormatted: string;
    channel: string;
  } | null>(null);

  // Settings
  const [clipCount, setClipCount] = useState<number>(3);
  const [clipLength, setClipLength] = useState<string>("auto");
  const [convertToShorts, setConvertToShorts] = useState<boolean>(true);
  const [autoCaptions, setAutoCaptions] = useState<boolean>(true);

  // Caption Settings
  const [captionLanguage, setCaptionLanguage] = useState<string>("hinglish");
  const [captionStyle, setCaptionStyle] = useState<string>("hormozi");
  const [fontFamily, setFontFamily] = useState<string>("Arial Black");
  const [captionPosition, setCaptionPosition] = useState<string>("bottom");
  const [fontSize, setFontSize] = useState<number>(24);
  const [maxWordsPerLine, setMaxWordsPerLine] = useState<number>(3);

  // Active Job & Progress
  const [currentJob, setCurrentJob] = useState<ClipJobData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"setup" | "progress" | "results">("setup");

  // Bulk Template State
  const [bulkTitleTemplate, setBulkTitleTemplate] = useState("Best Viral Moment #{n} 😱");
  const [bulkDescTemplate, setBulkDescTemplate] = useState("Clip #{n} from the most viral highlights. Subscribe for daily clips!");
  const [isBulkQueueing, setIsBulkQueueing] = useState(false);
  const [queueingClipId, setQueueingClipId] = useState<string | null>(null);

  // Toggle between Video player and Viral Thumbnail preview per clip
  const [clipViewMode, setClipViewMode] = useState<Record<string, "video" | "thumb">>({});

  // Check for latest job on mount
  useEffect(() => {
    if (isOpen) {
      checkLatestJob();
    }
  }, [isOpen]);

  const checkLatestJob = async () => {
    try {
      const res = await fetch("/api/clipper/latest");
      if (res.ok) {
        const data = await res.json();
        if (data.job) {
          setCurrentJob(data.job);
          if (["pending", "downloading", "transcribing", "analyzing", "cutting", "captioning"].includes(data.job.status)) {
            setActiveTab("progress");
          } else if (data.job.status === "completed" && data.job.clips?.length > 0) {
            setActiveTab("results");
          }
        }
      }
    } catch {
      // Ignore initial lookup failure
    }
  };

  // Poll job status when job is active
  useEffect(() => {
    if (!currentJob?.id) return;
    if (currentJob.status === "completed" || currentJob.status === "failed") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/clipper/${currentJob.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.job) {
            setCurrentJob(data.job);
            if (data.job.status === "completed") {
              setActiveTab("results");
              if (onNotification) onNotification("All clips generated successfully!", "success");
            } else if (data.job.status === "failed") {
              if (onNotification) onNotification(`Clipping failed: ${data.job.error}`, "error");
            }
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [currentJob?.id, currentJob?.status, onNotification]);

  // Helper to extract clean single URL
  const cleanYouTubeUrl = (raw: string): string => {
    const trimmed = raw.trim();
    const m = trimmed.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (m && m[1]) {
      return `https://www.youtube.com/watch?v=${m[1]}`;
    }
    return trimmed;
  };

  // Handle URL fetch
  const handleFetch = async (targetUrl?: string) => {
    setInputError(null);
    const rawToFetch = (targetUrl !== undefined ? targetUrl : url).trim();
    if (!rawToFetch) {
      setInputError("Please enter a YouTube video URL first!");
      urlInputRef.current?.focus();
      return;
    }

    const clean = cleanYouTubeUrl(rawToFetch);
    setUrl(clean);

    setIsFetching(true);
    try {
      const res = await fetch(`/api/clipper/fetch?url=${encodeURIComponent(clean)}`, {
        signal: AbortSignal.timeout(12000),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch video information");
      }

      setVideoMeta(data);
      // Auto-suggest clip count: 1 clip per ~6 minutes (1h = 10, 30m = 5, min 1, max 20)
      const suggestedClips = Math.max(1, Math.min(20, Math.round(data.duration / 360)));
      setClipCount(suggestedClips);

      if (onNotification) onNotification(`Found: "${data.title.slice(0, 45)}..."`, "success");
    } catch (err: any) {
      const errMsg = err.name === "TimeoutError" ? "Fetch took too long. Click Fetch Video to retry." : (err.message || "Failed to fetch video");
      setInputError(errMsg);
      if (onNotification) onNotification(errMsg, "error");
    } finally {
      setIsFetching(false);
    }
  };

  // Handle Start Generation
  const handleGenerate = async () => {
    setInputError(null);

    // If URL is empty, guide user directly
    if (!url.trim()) {
      setInputError("Please enter a YouTube video link before generating clips!");
      urlInputRef.current?.focus();
      return;
    }

    const clean = cleanYouTubeUrl(url);
    setUrl(clean);

    setIsSubmitting(true);
    try {
      // If user hasn't fetched videoMeta yet, attempt quick fetch
      let meta = videoMeta;
      if (!meta) {
        try {
          const fetchRes = await fetch(`/api/clipper/fetch?url=${encodeURIComponent(clean)}`, {
            signal: AbortSignal.timeout(8000),
          });
          if (fetchRes.ok) {
            meta = await fetchRes.json();
            setVideoMeta(meta);
          }
        } catch {
          // Proceed with defaults if preview fetch times out
        }
      }

      const payload = {
        youtubeUrl: clean,
        url: clean,
        videoTitle: meta?.title || "YouTube Video",
        title: meta?.title || "YouTube Video",
        videoThumbnail: meta?.thumbnail || "",
        thumbnail: meta?.thumbnail || "",
        videoDuration: meta?.duration || 0,
        duration: meta?.duration || 0,
        clipCount,
        clipLength,
        convertToShorts,
        autoCaptions,
        captionLanguage,
        captionStyle,
        captionPosition,
        fontFamily,
        fontSize,
        maxWordsPerLine,
        captionOptions: {
          language: captionLanguage,
          style: captionStyle,
          position: captionPosition,
          fontFamily,
          fontSize,
          maxWordsPerLine,
        },
      };

      const res = await fetch("/api/clipper/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start clipping job");
      }

      setCurrentJob(data.job);
      setActiveTab("progress");
      if (onNotification) onNotification("Clipping job started in background!", "success");
    } catch (err: any) {
      setInputError(err.message);
      if (onNotification) onNotification(err.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle captions on a clip
  const handleToggleCaptions = async (clip: ClipItem) => {
    const newHasCaptions = !clip.hasCaptions;
    try {
      const res = await fetch(`/api/clipper/clip/${clip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hasCaptions: newHasCaptions }),
      });
      if (res.ok) {
        setCurrentJob((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            clips: prev.clips.map((c) =>
              c.id === clip.id ? { ...c, hasCaptions: newHasCaptions } : c
            ),
          };
        });
      }
    } catch (err) {
      console.error("Failed to toggle captions:", err);
    }
  };

  // Edit clip title / description in local state
  const handleClipEdit = (clipId: string, field: "title" | "description", val: string) => {
    setCurrentJob((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        clips: prev.clips.map((c) => (c.id === clipId ? { ...c, [field]: val } : c)),
      };
    });
  };

  // Save clip title / description to server
  const handleSaveClipDetails = async (clip: ClipItem) => {
    try {
      await fetch(`/api/clipper/clip/${clip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: clip.title,
          description: clip.description,
        }),
      });
      if (onNotification) onNotification("Clip metadata saved", "info");
    } catch (err) {
      console.error("Save error:", err);
    }
  };

  // Delete individual clip
  const handleDeleteClip = async (clipId: string) => {
    try {
      const res = await fetch(`/api/clipper/clip/${clipId}`, { method: "DELETE" });
      if (res.ok) {
        setCurrentJob((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            clips: prev.clips.filter((c) => c.id !== clipId),
          };
        });
        if (onNotification) onNotification("Clip removed", "info");
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  // Add individual clip to upload queue
  const handleAddToQueue = async (clip: ClipItem) => {
    setQueueingClipId(clip.id);
    try {
      const res = await fetch("/api/clipper/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clipId: clip.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to queue clip");

      setCurrentJob((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          clips: prev.clips.map((c) => (c.id === clip.id ? { ...c, isQueued: true } : c)),
        };
      });

      if (onNotification) onNotification(`Clip #${clip.clipIndex} added to upload queue!`, "success");
      if (onClipsQueued) onClipsQueued();
    } catch (err: any) {
      if (onNotification) onNotification(err.message, "error");
    } finally {
      setQueueingClipId(null);
    }
  };

  // Add all clips to queue
  const handleAddAllToQueue = async () => {
    if (!currentJob?.clips?.length) return;

    setIsBulkQueueing(true);
    try {
      const clipIds = currentJob.clips.map((c) => c.id);
      const res = await fetch("/api/clipper/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clipIds,
          titleTemplate: bulkTitleTemplate.trim() || undefined,
          descriptionTemplate: bulkDescTemplate.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add all clips to queue");

      setCurrentJob((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          clips: prev.clips.map((c) => ({ ...c, isQueued: true })),
        };
      });

      if (onNotification) {
        onNotification(`Added all ${data.count} clips to the upload queue!`, "success");
      }
      if (onClipsQueued) onClipsQueued();
    } catch (err: any) {
      if (onNotification) onNotification(err.message, "error");
    } finally {
      setIsBulkQueueing(false);
    }
  };

  // Stages configuration for progress bar
  const stages = [
    { key: "downloading", label: "Downloading Video" },
    { key: "transcribing", label: "AI Transcription" },
    { key: "analyzing", label: "Detecting Viral Moments" },
    { key: "cutting", label: "Cutting & 9:16 Crop" },
    { key: "captioning", label: "Styling Auto Captions" },
    { key: "thumbnails", label: "Adding Clips Thumbnail" },
  ];

  const currentStageIndex = useMemo(() => {
    if (!currentJob) return 0;
    if (currentJob.status === "completed") return 6;
    if (currentJob.status === "failed") return -1;
    if (currentJob.currentStep?.toLowerCase().includes("thumbnail")) return 5;
    const idx = stages.findIndex((s) => s.key === currentJob.status);
    return idx >= 0 ? idx : 0;
  }, [currentJob]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-5xl max-h-[94vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-emerald-500 via-green-400 to-yellow-400 rounded-xl text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.35)]">
              <Scissors className="w-5 h-5 fill-slate-950/20" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-lg text-white tracking-tight">
                  MachinkoAuto<span className="text-emerald-400 font-mono">.Ai</span> Clipper
                </h2>
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                  Agnes AI Thumbnails + Auto Captions
                </span>
              </div>
              <p className="text-xs text-yellow-300/80 font-medium">
                High-energy viral moment detection • 9:16 Shorts conversion • 0-Storage auto-cleanup
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Nav Tabs */}
            <div className="flex bg-slate-800/80 p-1 rounded-xl text-xs font-medium border border-slate-700/60 mr-2">
              <button
                onClick={() => setActiveTab("setup")}
                className={`px-3 py-1 rounded-lg transition-all ${
                  activeTab === "setup"
                    ? "bg-slate-700 text-white shadow-sm font-semibold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                1. Setup
              </button>
              <button
                onClick={() => setActiveTab("progress")}
                disabled={!currentJob}
                className={`px-3 py-1 rounded-lg transition-all ${
                  activeTab === "progress"
                    ? "bg-slate-700 text-white shadow-sm font-semibold"
                    : "text-slate-400 hover:text-white disabled:opacity-40"
                }`}
              >
                2. Live Progress
              </button>
              <button
                onClick={() => setActiveTab("results")}
                disabled={!currentJob?.clips?.length}
                className={`px-3 py-1 rounded-lg transition-all ${
                  activeTab === "results"
                    ? "bg-slate-700 text-white shadow-sm font-semibold"
                    : "text-slate-400 hover:text-white disabled:opacity-40"
                }`}
              >
                3. Clips ({currentJob?.clips?.length || 0})
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PINNED URL INPUT BAR (Always visible in Setup) */}
        {activeTab === "setup" && (
          <div className="px-6 py-3.5 bg-slate-950/90 border-b border-slate-800 space-y-2">
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
              <div className="relative flex-1">
                <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />
                <input
                  ref={urlInputRef}
                  type="url"
                  value={url}
                  onChange={(e) => {
                    let val = e.target.value;
                    if (val.includes("youtu") && (val.includes("http", 8) || val.length > 80)) {
                      val = cleanYouTubeUrl(val);
                    }
                    setUrl(val);
                    if (inputError) setInputError(null);
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pasted = e.clipboardData.getData("text").trim();
                    const clean = cleanYouTubeUrl(pasted);
                    setUrl(clean);
                    if (inputError) setInputError(null);
                    handleFetch(clean);
                  }}
                  placeholder="Paste YouTube Video Link here (e.g. https://www.youtube.com/watch?v=... or https://youtu.be/...)"
                  className={`w-full pl-10 pr-4 py-2.5 bg-slate-900 border rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none transition-all shadow-inner ${
                    inputError
                      ? "border-red-500 ring-2 ring-red-500/30"
                      : "border-slate-700 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  }`}
                  onKeyDown={(e) => e.key === "Enter" && handleFetch()}
                />
              </div>

              <button
                onClick={() => handleFetch()}
                disabled={isFetching}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs sm:text-sm font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-red-950/40 transition-all hover:scale-[1.02] shrink-0"
              >
                {isFetching ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Fetching Info...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Fetch Video
                  </>
                )}
              </button>
            </div>

            {/* Error Message if URL missing or invalid */}
            {inputError && (
              <div className="p-2.5 bg-red-950/60 border border-red-500/50 rounded-xl text-xs text-red-300 flex items-center gap-2 animate-in slide-in-from-top-1">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{inputError}</span>
              </div>
            )}

            {/* Fetched Video Card */}
            {videoMeta && (
              <div className="p-3 bg-slate-900/90 border border-slate-700/80 rounded-xl flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between animate-in fade-in duration-300 shadow-md">
                <div className="flex gap-3 items-center min-w-0">
                  {videoMeta.thumbnail ? (
                    <img
                      src={videoMeta.thumbnail}
                      alt={videoMeta.title}
                      className="w-24 h-14 object-cover rounded-lg border border-slate-700 shadow-sm shrink-0"
                    />
                  ) : (
                    <div className="w-24 h-14 bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
                      <Play className="w-5 h-5 text-slate-500" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h4 className="font-semibold text-xs sm:text-sm text-white truncate max-w-lg">
                      {videoMeta.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                      <span className="truncate max-w-[150px]">{videoMeta.channel}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-mono text-amber-300">
                        <Clock className="w-3 h-3" />
                        {videoMeta.durationFormatted}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                    ✓ Video Detected
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: SETUP */}
          {activeTab === "setup" && (
            <div className="space-y-6">
              {/* Clipper Configuration Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column: Clips & Format */}
                <div className="space-y-5 bg-slate-950/40 p-5 rounded-2xl border border-slate-800/80">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    Clip Selection Settings
                  </h3>

                  {/* Number of clips */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-300">Kitne Clips Chahiye?</span>
                      <span className="font-mono text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        {clipCount} clips
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="1"
                        max="20"
                        value={clipCount}
                        onChange={(e) => setClipCount(Number(e.target.value))}
                        className="flex-1 accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={clipCount}
                        onChange={(e) =>
                          setClipCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
                        }
                        className="w-16 px-2 py-1 text-center bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Recommendation: 1 clip per ~6 minutes of video (Default calculated automatically).
                    </p>
                  </div>

                  {/* Clip Length */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-300 block">Clip Target Length</span>
                    <div className="grid grid-cols-5 gap-1.5">
                      {["auto", "15s", "30s", "45s", "60s"].map((len) => (
                        <button
                          key={len}
                          type="button"
                          onClick={() => setClipLength(len)}
                          className={`py-1.5 text-xs font-medium rounded-lg border transition-all ${
                            clipLength === len
                              ? "bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-md shadow-amber-950/50"
                              : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700"
                          }`}
                        >
                          {len === "auto" ? "Auto" : len}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      "Auto" cuts dynamically at natural sentence pauses & speech boundaries.
                    </p>
                  </div>

                  {/* Format Toggles */}
                  <div className="pt-2 space-y-3">
                    <label className="flex items-start gap-3 p-3 bg-slate-900/80 rounded-xl border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
                      <input
                        type="checkbox"
                        checked={convertToShorts}
                        onChange={(e) => setConvertToShorts(e.target.checked)}
                        className="mt-0.5 accent-red-600 rounded"
                      />
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                          <Smartphone className="w-3.5 h-3.5 text-red-400" />
                          Convert to Shorts (9:16 Vertical)
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Applies smart center crop with blurred cinematic background fill.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 bg-slate-900/80 rounded-xl border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
                      <input
                        type="checkbox"
                        checked={autoCaptions}
                        onChange={(e) => setAutoCaptions(e.target.checked)}
                        className="mt-0.5 accent-amber-500 rounded"
                      />
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                          <Subtitles className="w-3.5 h-3.5 text-amber-400" />
                          Auto Captions (Word-level Burn-in)
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Generates animated word-level captions burnt into the video.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Right Column: Auto Captions Styling & Live Preview */}
                <div className="space-y-5 bg-slate-950/40 p-5 rounded-2xl border border-slate-800/80">
                  <h3 className="text-sm font-bold text-white flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <Type className="w-4 h-4 text-emerald-400" />
                      Auto Captions Customizer
                    </div>
                    <span className="text-[10px] text-emerald-400 font-normal">
                      {autoCaptions ? "Active" : "Disabled"}
                    </span>
                  </h3>

                  {autoCaptions ? (
                    <div className="space-y-4">
                      {/* Language Selection */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-300">
                          Caption Language
                        </label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {[
                            { id: "auto", label: "Auto" },
                            { id: "hi", label: "Hindi (हिंदी)" },
                            { id: "hinglish", label: "Hinglish" },
                            { id: "en", label: "English" },
                          ].map((lang) => (
                            <button
                              key={lang.id}
                              type="button"
                              onClick={() => setCaptionLanguage(lang.id)}
                              className={`py-1.5 px-1 text-xs rounded-lg border text-center transition-all ${
                                captionLanguage === lang.id
                                  ? "bg-emerald-600 text-white font-bold border-emerald-500 shadow-md"
                                  : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                              }`}
                            >
                              {lang.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Caption Style */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                          <span>Caption Style</span>
                          <span className="text-[10px] text-amber-400 font-normal">Hormozi & Beast Styles</span>
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {[
                            { id: "hormozi", label: "🔥 Hormozi Pop", desc: "Bold uppercase yellow + neon green active punch" },
                            { id: "beast_punch", label: "💥 Beast Punch", desc: "MrBeast red/yellow split outline" },
                            { id: "neon_glow", label: "⚡ Cyber Neon", desc: "Vibrant cyan with magenta glow" },
                            { id: "sub_box", label: "⬛ Sub Box", desc: "Netflix/TikTok dark rounded pill box" },
                            { id: "comic_pop", label: "🎨 Comic Pop", desc: "Playful bouncy amber cartoon captions" },
                            { id: "karaoke", label: "🎤 Karaoke Glow", desc: "Current word highlighted yellow" },
                            { id: "bold_yellow", label: "⚡ Bold Yellow", desc: "Punchy yellow with heavy black border" },
                            { id: "classic", label: "⚪ Classic White", desc: "White text with thick black outline" },
                            { id: "minimal", label: "✨ Minimalist", desc: "Clean modern font with subtle backdrop" },
                          ].map((st) => (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() => setCaptionStyle(st.id)}
                              className={`p-2 rounded-xl border text-left transition-all ${
                                captionStyle === st.id
                                  ? "bg-slate-800 border-amber-500 shadow-md text-white ring-1 ring-amber-500/30"
                                  : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              <div className="text-xs font-bold text-white">{st.label}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{st.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Font Family Selection */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Type className="w-3.5 h-3.5 text-amber-400" />
                            Font Family
                          </span>
                          <span className="text-[10px] text-slate-400">Viral Gaming & Hinglish Tested</span>
                        </label>
                        <select
                          value={fontFamily}
                          onChange={(e) => setFontFamily(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500 font-semibold"
                        >
                          <option value="Arial Black">Arial Black (Ultra-Bold Viral)</option>
                          <option value="Impact">Impact (Classic Gaming Meme)</option>
                          <option value="Montserrat">Montserrat (Clean High-End)</option>
                          <option value="Nirmala UI">Nirmala UI (Hinglish & Hindi Ultra-Clear)</option>
                          <option value="Trebuchet MS">Trebuchet MS (Dynamic Sharp)</option>
                        </select>
                      </div>

                      {/* Position & Words Per Line */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-300">Position</label>
                          <select
                            value={captionPosition}
                            onChange={(e) => setCaptionPosition(e.target.value)}
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                          >
                            <option value="bottom">Bottom (Shorts Safe)</option>
                            <option value="center">Center</option>
                            <option value="top">Top</option>
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-300 flex justify-between">
                            <span>Max Words / Line</span>
                            <span className="text-emerald-400 font-mono">{maxWordsPerLine}</span>
                          </label>
                          <input
                            type="range"
                            min="2"
                            max="6"
                            value={maxWordsPerLine}
                            onChange={(e) => setMaxWordsPerLine(Number(e.target.value))}
                            className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer mt-2"
                          />
                        </div>
                      </div>

                      {/* Font Size Slider */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-300 flex justify-between">
                          <span>Font Size</span>
                          <span className="text-emerald-400 font-mono">{fontSize} pt</span>
                        </label>
                        <input
                          type="range"
                          min="18"
                          max="38"
                          value={fontSize}
                          onChange={(e) => setFontSize(Number(e.target.value))}
                          className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                        />
                      </div>

                      {/* Interactive Live Caption Preview */}
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3 text-indigo-400" />
                            Live Caption Preview
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">Font: {fontFamily}</span>
                        </span>
                        <div className="relative h-28 bg-gradient-to-b from-slate-900 to-black rounded-xl border border-slate-800 flex items-center justify-center overflow-hidden p-3 select-none">
                          <div className="absolute top-2 left-2 text-[9px] text-slate-500 font-mono">
                            9:16 Canvas
                          </div>

                          <div
                            className={`text-center font-extrabold uppercase transition-all duration-300 ${
                              captionPosition === "top"
                                ? "self-start pt-1"
                                : captionPosition === "center"
                                ? "self-center"
                                : "self-end pb-2"
                            }`}
                            style={{
                              fontFamily: fontFamily,
                              fontSize: `${Math.max(12, Math.min(22, fontSize * 0.7))}px`,
                              lineHeight: 1.25,
                              letterSpacing: "0.03em",
                            }}
                          >
                            {captionStyle === "hormozi" && (
                              <p>
                                <span className="text-yellow-300 drop-shadow-[0_3px_6px_rgba(0,0,0,1)] [-webkit-text-stroke:1.5px_black]">
                                  YEH MOMENT
                                </span>{" "}
                                <span className="text-emerald-400 drop-shadow-[0_3px_6px_rgba(0,0,0,1)] [-webkit-text-stroke:1.5px_black] scale-110 inline-block px-1">
                                  SABSE CRAZY THA!
                                </span>
                              </p>
                            )}
                            {captionStyle === "beast_punch" && (
                              <p className="text-amber-300 drop-shadow-[0_3px_6px_rgba(0,0,0,1)] [-webkit-text-stroke:2px_#7f1d1d]">
                                YEH MOMENT SABSE CRAZY THA!
                              </p>
                            )}
                            {captionStyle === "neon_glow" && (
                              <p className="text-cyan-300 drop-shadow-[0_0_12px_rgba(6,182,212,0.9)] [-webkit-text-stroke:1px_#083344]">
                                YEH MOMENT SABSE CRAZY THA!
                              </p>
                            )}
                            {captionStyle === "sub_box" && (
                              <p className="inline-block bg-black/85 text-white px-2.5 py-1 rounded-md border border-white/20 shadow-lg">
                                YEH MOMENT SABSE CRAZY THA!
                              </p>
                            )}
                            {captionStyle === "comic_pop" && (
                              <p className="text-amber-400 -rotate-1 drop-shadow-[0_3px_4px_rgba(0,0,0,1)] [-webkit-text-stroke:1px_#451a03]">
                                YEH MOMENT SABSE CRAZY THA!
                              </p>
                            )}
                            {captionStyle === "karaoke" && (
                              <p>
                                <span className="text-yellow-300 drop-shadow-[0_2px_4px_rgba(0,0,0,1)] bg-amber-950/40 px-1 rounded border border-yellow-400/30">
                                  YEH MOMENT
                                </span>{" "}
                                <span className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                                  SABSE CRAZY THA!
                                </span>
                              </p>
                            )}
                            {captionStyle === "bold_yellow" && (
                              <p className="text-yellow-400 drop-shadow-[0_3px_5px_rgba(0,0,0,1)] [-webkit-text-stroke:1px_black]">
                                YEH MOMENT SABSE CRAZY THA!
                              </p>
                            )}
                            {captionStyle === "classic" && (
                              <p className="text-white drop-shadow-[0_3px_5px_rgba(0,0,0,1)] [-webkit-text-stroke:1px_black]">
                                YEH MOMENT SABSE CRAZY THA!
                              </p>
                            )}
                            {captionStyle === "minimal" && (
                              <p className="text-slate-100 font-medium tracking-normal drop-shadow-md">
                                Yeh moment sabse crazy tha!
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
                      <p className="text-xs">
                        Auto Captions are turned off. Plain clips will be saved without text overlay.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LIVE PROGRESS */}
          {activeTab === "progress" && (
            <div className="space-y-8 py-4">
              <div className="text-center max-w-lg mx-auto space-y-2">
                <div className="inline-flex p-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 mb-2">
                  <Scissors className="w-7 h-7 animate-pulse" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  {currentJob?.status === "completed"
                    ? "Clipping Complete! 🎉"
                    : currentJob?.status === "failed"
                    ? "Clipping Encountered an Issue"
                    : "Autonomous AI Pipeline In Progress"}
                </h3>
                <p className="text-xs text-slate-400">
                  {currentJob?.currentStep || currentJob?.currentStage || "Processing your video autonomously in the background..."}
                </p>
              </div>

              {/* Progress Bar */}
              <div className="max-w-xl mx-auto space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-400">Overall Pipeline Progress</span>
                  <span className="text-amber-400 font-mono">{currentJob?.progress || 0}%</span>
                </div>
                <div className="h-3 w-full bg-slate-950 rounded-full border border-slate-800 overflow-hidden p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      currentJob?.status === "failed"
                        ? "bg-red-500"
                        : currentJob?.status === "completed"
                        ? "bg-emerald-500"
                        : "bg-gradient-to-r from-red-600 via-amber-500 to-emerald-500"
                    }`}
                    style={{ width: `${Math.max(5, currentJob?.progress || 0)}%` }}
                  />
                </div>
              </div>

              {/* Stage Stepper */}
              <div className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                {stages.map((stage, idx) => {
                  const isDone = currentStageIndex > idx || currentJob?.status === "completed";
                  const isCurrent = currentStageIndex === idx && currentJob?.status !== "completed";

                  return (
                    <div
                      key={stage.key}
                      className={`p-3.5 rounded-xl border text-center transition-all ${
                        isDone
                          ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-400"
                          : isCurrent
                          ? "bg-amber-950/30 border-amber-500/60 text-amber-300 ring-2 ring-amber-500/20 animate-pulse"
                          : "bg-slate-950/40 border-slate-800 text-slate-500"
                      }`}
                    >
                      <div className="flex items-center justify-center mb-1.5">
                        {isDone ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        ) : isCurrent ? (
                          <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                        ) : (
                          <span className="w-5 h-5 rounded-full border border-slate-700 flex items-center justify-center text-[10px] font-mono">
                            {idx + 1}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-semibold">{stage.label}</div>
                    </div>
                  );
                })}
              </div>

              {/* Error Message if Failed */}
              {currentJob?.status === "failed" && (
                <div className="max-w-xl mx-auto space-y-3">
                  <div className="p-4 bg-red-950/40 border border-red-500/50 rounded-xl text-xs text-red-300 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                    <div>
                      <span className="font-bold">Error:</span> {currentJob.error || "Unknown pipeline error"}
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <button
                      onClick={() => {
                        setCurrentJob(null);
                        setActiveTab("setup");
                      }}
                      className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-red-950/40 flex items-center gap-2 transition-all hover:scale-105"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Try Again (Back to Setup)
                    </button>
                  </div>
                </div>
              )}

              {/* If completed, show Jump to Results */}
              {currentJob?.status === "completed" && (
                <div className="text-center pt-4">
                  <button
                    onClick={() => setActiveTab("results")}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/50 inline-flex items-center gap-2"
                  >
                    View {currentJob.clips?.length || 0} Generated Clips
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RESULTS GRID */}
          {activeTab === "results" && (
            <div className="space-y-6">
              {/* Header Actions & Bulk Panel */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
                <div>
                  <h3 className="font-bold text-base text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    {currentJob?.clips?.length || 0} Viral Clips Generated
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Preview clips, toggle captions on/off, edit titles, and queue directly for YouTube upload.
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => setActiveTab("setup")}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition-colors"
                  >
                    + Clip Another Video
                  </button>

                  <button
                    onClick={handleAddAllToQueue}
                    disabled={isBulkQueueing || !currentJob?.clips?.length}
                    className="px-4 py-2 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-red-950/40 flex items-center gap-1.5 transition-all"
                  >
                    {isBulkQueueing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Adding all to queue...
                      </>
                    ) : (
                      <>
                        <Layers className="w-4 h-4" />
                        Add All to Upload Queue
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Bulk Title/Description Template Accordion */}
              <div className="p-4 bg-slate-950/40 border border-slate-800/80 rounded-xl space-y-3">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  Bulk Metadata Template (Optional - use {"{n}"} for clip number):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={bulkTitleTemplate}
                    onChange={(e) => setBulkTitleTemplate(e.target.value)}
                    placeholder="e.g. Viral Stream Highlight #{n} #Shorts"
                    className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                  <input
                    type="text"
                    value={bulkDescTemplate}
                    onChange={(e) => setBulkDescTemplate(e.target.value)}
                    placeholder="e.g. Crazy moment #{n} from today's stream! #shorts"
                    className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Clips Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {currentJob?.clips?.map((clip) => {
                  const activeVideoSource = clip.hasCaptions
                    ? clip.videoPath
                    : clip.noCaptionsPath || clip.videoPath;

                  return (
                    <div
                      key={clip.id}
                      className="bg-slate-950/80 border border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-xl hover:border-slate-700 transition-all"
                    >
                      {/* Video Player OR High-CTR Thumbnail Preview */}
                      <div className="relative bg-black aspect-[9/16] max-h-72 w-full flex items-center justify-center overflow-hidden">
                        {clipViewMode[clip.id] === "thumb" && clip.thumbnailPath ? (
                          <div className="relative w-full h-full flex items-center justify-center bg-slate-950">
                            <img
                              src={clip.thumbnailPath}
                              alt={clip.title}
                              className="w-full h-full object-cover animate-in fade-in duration-200"
                            />
                            <div className="absolute bottom-2 left-2 right-2 px-2 py-1 bg-black/85 backdrop-blur-md rounded-md text-[9px] text-amber-300 font-bold text-center border border-amber-500/30 shadow-md">
                              🔥 Viral Thumbnail (Auto-Uploaded to YouTube)
                            </div>
                          </div>
                        ) : (
                          <video
                            src={activeVideoSource}
                            controls
                            playsInline
                            preload="metadata"
                            className="w-full h-full object-contain"
                          />
                        )}

                        {/* Badges Overlay */}
                        <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10 pointer-events-none">
                          <span className="px-2 py-0.5 rounded-full bg-slate-900/80 backdrop-blur-md text-[10px] font-mono text-white border border-slate-700">
                            #{clip.clipIndex}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/80 backdrop-blur-md text-[10px] font-bold text-slate-950 flex items-center gap-0.5 shadow-sm">
                            <Flame className="w-3 h-3 fill-slate-950" />
                            {clip.funScore} Score
                          </span>
                        </div>

                        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
                          {clip.thumbnailPath && (
                            <button
                              type="button"
                              onClick={() =>
                                setClipViewMode((prev) => ({
                                  ...prev,
                                  [clip.id]: prev[clip.id] === "thumb" ? "video" : "thumb",
                                }))
                              }
                              className="px-2 py-0.5 rounded-full bg-slate-900/90 hover:bg-slate-800 text-[10px] font-bold text-amber-300 border border-amber-500/40 shadow-sm flex items-center gap-1 transition-all"
                              title="Toggle between Video and Thumbnail Preview"
                            >
                              <Eye className="w-3 h-3" />
                              {clipViewMode[clip.id] === "thumb" ? "Video" : "Thumb"}
                            </button>
                          )}
                          <span className="px-2 py-0.5 rounded-full bg-slate-900/80 backdrop-blur-md text-[10px] font-mono text-amber-300 border border-slate-700">
                            {Math.round(clip.duration)}s
                          </span>
                        </div>
                      </div>

                      {/* Clip Metadata & Controls */}
                      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                        {/* Title & Description Fields */}
                        <div className="space-y-2">
                          <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                              Clip Title
                            </label>
                            <input
                              type="text"
                              value={clip.title}
                              onChange={(e) => handleClipEdit(clip.id, "title", e.target.value)}
                              onBlur={() => handleSaveClipDetails(clip)}
                              className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-red-500 font-medium"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                              Description
                            </label>
                            <textarea
                              rows={2}
                              value={clip.description}
                              onChange={(e) => handleClipEdit(clip.id, "description", e.target.value)}
                              onBlur={() => handleSaveClipDetails(clip)}
                              className="w-full px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-[11px] text-slate-300 focus:outline-none focus:border-red-500 resize-none"
                            />
                          </div>
                        </div>

                        {/* Captions & Thumbnail Controls */}
                        <div className="pt-2 border-t border-slate-800/80 space-y-2">
                          {/* Preview Switcher */}
                          {clip.thumbnailPath && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-400 flex items-center gap-1.5">
                                <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                                Preview
                              </span>
                              <div className="inline-flex p-0.5 bg-slate-900 border border-slate-800 rounded-lg text-[10px] font-semibold">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setClipViewMode((prev) => ({ ...prev, [clip.id]: "video" }))
                                  }
                                  className={`px-2 py-0.5 rounded transition-all ${
                                    clipViewMode[clip.id] !== "thumb"
                                      ? "bg-slate-800 text-white shadow-sm font-bold"
                                      : "text-slate-400 hover:text-white"
                                  }`}
                                >
                                  🎬 Video
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setClipViewMode((prev) => ({ ...prev, [clip.id]: "thumb" }))
                                  }
                                  className={`px-2 py-0.5 rounded transition-all ${
                                    clipViewMode[clip.id] === "thumb"
                                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold"
                                      : "text-slate-400 hover:text-white"
                                  }`}
                                >
                                  🖼️ Thumbnail
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Captions Switch */}
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400 flex items-center gap-1.5">
                              <Subtitles className="w-3.5 h-3.5 text-amber-400" />
                              Captions
                            </span>
                            <button
                              type="button"
                              onClick={() => handleToggleCaptions(clip)}
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                                clip.hasCaptions
                                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                  : "bg-slate-800 text-slate-400 border border-slate-700"
                              }`}
                            >
                              {clip.hasCaptions ? "Captions: ON" : "Captions: OFF"}
                            </button>
                          </div>

                          {/* Action Row */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleAddToQueue(clip)}
                              disabled={queueingClipId === clip.id || clip.isQueued}
                              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                                clip.isQueued
                                  ? "bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 cursor-default"
                                  : "bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-950/40"
                              }`}
                            >
                              {clip.isQueued ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  Queued in Dashboard
                                </>
                              ) : queueingClipId === clip.id ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  Adding...
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3.5 h-3.5" />
                                  Add to Queue
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => handleDeleteClip(clip.id)}
                              title="Delete Clip"
                              className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-900 border border-slate-800 rounded-xl transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* PINNED BOTTOM ACTION BAR (Setup Tab) */}
        {activeTab === "setup" && (
          <div className="p-4 border-t border-slate-800 bg-slate-950/80">
            <button
              onClick={handleGenerate}
              disabled={isSubmitting}
              className="w-full py-3.5 bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 disabled:opacity-60 text-white font-bold text-sm rounded-xl shadow-xl shadow-red-950/50 flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Starting AI Pipeline...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-amber-200" />
                  Generate {clipCount} Viral Clips Now
                </>
              )}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
