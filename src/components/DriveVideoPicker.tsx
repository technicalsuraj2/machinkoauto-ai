"use client";

import { useState, useEffect } from "react";
import { Folder, Film, Check, Loader2, X, RefreshCw, HardDrive } from "lucide-react";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  createdTime?: string;
  videoMediaMetadata?: {
    width?: number;
    height?: number;
    durationMillis?: string;
  };
}

export function getVideoFormatInfo(file: DriveFile) {
  const meta = file.videoMediaMetadata;
  const durationSec = meta?.durationMillis ? Math.round(Number(meta.durationMillis) / 1000) : 0;
  const width = meta?.width || 0;
  const height = meta?.height || 0;

  // YouTube Shorts: <= 60 seconds OR vertical/square (height >= width) <= 180s
  const isShort =
    (durationSec > 0 && durationSec <= 60) ||
    (height >= width && durationSec <= 180) ||
    file.name.toLowerCase().includes("reel") ||
    file.name.toLowerCase().includes("short");

  return { isShort, durationSec, width, height };
}

interface DriveFolder {
  id: string;
  name: string;
}

interface DriveVideoPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onVideosImported: () => void;
}

function formatBytes(bytes?: string): string {
  if (!bytes) return "Unknown size";
  const num = parseInt(bytes, 10);
  if (isNaN(num)) return "Unknown";
  if (num < 1024) return num + " B";
  if (num < 1024 * 1024) return (num / 1024).toFixed(1) + " KB";
  if (num < 1024 * 1024 * 1024) return (num / (1024 * 1024)).toFixed(1) + " MB";
  return (num / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

export default function DriveVideoPicker({
  isOpen,
  onClose,
  onVideosImported,
}: DriveVideoPickerProps) {
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [videos, setVideos] = useState<DriveFile[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadFolders();
      loadVideos("");
    }
  }, [isOpen]);

  const loadFolders = async () => {
    try {
      const res = await fetch("/api/drive/folders");
      if (res.ok) {
        const data = await res.json();
        setFolders(data.folders || []);
      }
    } catch (err) {
      console.error("Failed to load folders:", err);
    }
  };

  const loadVideos = async (folderId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const url = folderId
        ? `/api/drive/videos?folderId=${encodeURIComponent(folderId)}`
        : "/api/drive/videos";
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load videos from Google Drive");
      }

      setVideos(data.videos || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFolderChange = (folderId: string) => {
    setSelectedFolderId(folderId);
    setSelectedFileIds(new Set());
    loadVideos(folderId);
  };

  const toggleSelect = (id: string) => {
    const updated = new Set(selectedFileIds);
    if (updated.has(id)) {
      updated.delete(id);
    } else {
      updated.add(id);
    }
    setSelectedFileIds(updated);
  };

  const toggleSelectAll = () => {
    if (selectedFileIds.size === videos.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(videos.map((v) => v.id)));
    }
  };

  const handleImport = async () => {
    const chosen = videos.filter((v) => selectedFileIds.has(v.id));
    if (!chosen.length) return;

    setIsImporting(true);
    try {
      const payload = chosen.map((v) => {
        const { isShort, durationSec } = getVideoFormatInfo(v);
        const cleanName = v.name.replace(/\.[^/.]+$/, "");
        const title = isShort
          ? `${cleanName.slice(0, 85)} #Shorts`
          : cleanName;
        const tags = isShort
          ? "Shorts,shorts,viral,reel,video"
          : "video,upload,autotube";

        return {
          driveFileId: v.id,
          fileName: v.name,
          title,
          description: isShort
            ? `${cleanName}\n\n#Shorts #shorts #viralshorts #reels`
            : `Imported from Google Drive: ${v.name}`,
          tags,
          privacy: "public",
          madeForKids: false,
          fileSize: `${formatBytes(v.size)}${durationSec > 0 ? ` • ${durationSec}s` : ""}`,
        };
      });

      const res = await fetch("/api/videos/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videos: payload }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save videos to queue");
      }

      onVideosImported();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Google Drive Video Explorer</h2>
              <p className="text-xs text-slate-400">
                Select video files to add to your autonomous upload queue
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-amber-400" />
            <select
              value={selectedFolderId}
              onChange={(e) => handleFolderChange(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">All Drive Folders (Root)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  📁 {f.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => loadVideos(selectedFolderId)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {videos.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSelectAll}
                className="text-blue-400 hover:underline font-medium"
              >
                {selectedFileIds.size === videos.length ? "Deselect All" : "Select All"}
              </button>
              <span className="text-slate-500">|</span>
              <span className="text-slate-400">
                {selectedFileIds.size} of {videos.length} selected
              </span>
            </div>
          )}
        </div>

        {/* Video List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <span>Scanning Google Drive for video files...</span>
            </div>
          ) : error ? (
            <div className="py-12 text-center">
              <p className="text-red-400 text-sm mb-2">{error}</p>
              <button
                onClick={() => loadVideos(selectedFolderId)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs"
              >
                Try Again
              </button>
            </div>
          ) : videos.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Film className="w-12 h-12 mx-auto mb-2 text-slate-600" />
              <p className="text-sm font-medium text-slate-300">No video files found in this folder</p>
              <p className="text-xs text-slate-500 mt-1">
                Upload some video files (.mp4, .mov, .mkv) to Google Drive and refresh.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {videos.map((file) => {
                const isSelected = selectedFileIds.has(file.id);
                const formatInfo = getVideoFormatInfo(file);
                return (
                  <div
                    key={file.id}
                    onClick={() => toggleSelect(file.id)}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? "bg-blue-950/40 border-blue-500/80 ring-1 ring-blue-500/50"
                        : "bg-slate-950/40 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 mt-0.5 rounded flex items-center justify-center border transition-colors shrink-0 ${
                        isSelected
                          ? "bg-blue-600 border-blue-500 text-white"
                          : "border-slate-700 bg-slate-900"
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <p className="text-sm font-medium text-white truncate" title={file.name}>
                          {file.name}
                        </p>
                        {formatInfo.isShort ? (
                          <span className="shrink-0 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold">
                            ⚡ Short {formatInfo.durationSec > 0 ? `(${formatInfo.durationSec}s)` : ""}
                          </span>
                        ) : (
                          <span className="shrink-0 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-medium">
                            🎬 Video {formatInfo.durationSec > 0 ? `(${formatInfo.durationSec}s)` : ""}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                        <span>{formatBytes(file.size)}</span>
                        {file.createdTime && (
                          <>
                            <span>•</span>
                            <span>{new Date(file.createdTime).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between bg-slate-950">
          <span className="text-xs text-slate-400">
            {selectedFileIds.size} file(s) selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={selectedFileIds.size === 0 || isImporting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-blue-900/30 flex items-center gap-2 disabled:opacity-50"
            >
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Import to Queue ({selectedFileIds.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
