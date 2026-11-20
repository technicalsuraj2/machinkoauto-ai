"use client";

import { useState } from "react";
import {
  Film,
  Trash2,
  Edit2,
  Save,
  Check,
  RotateCcw,
  ExternalLink,
  Lock,
  Globe,
  EyeOff,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Clock,
  Baby,
} from "lucide-react";

export interface VideoItem {
  id: string;
  driveFileId: string;
  thumbnailPath?: string | null;
  fileName: string;
  title: string;
  description?: string | null;
  tags?: string | null;
  privacy: "private" | "unlisted" | "public";
  madeForKids: boolean;
  orderIndex: number;
  status: "pending" | "uploading" | "uploaded" | "failed" | "paused";
  youtubeVideoId?: string | null;
  error?: string | null;
  attempts: number;
  progress: number;
  fileSize?: string | null;
  createdAt: string;
}

interface VideoTableProps {
  videos: VideoItem[];
  onRefresh: () => void;
  onNotification?: (msg: string, type: "success" | "error" | "info") => void;
}

export default function VideoTable({
  videos,
  onRefresh,
  onNotification,
}: VideoTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<VideoItem>>({});
  const [isSaving, setIsSaving] = useState(false);

  const startEdit = (video: VideoItem) => {
    setEditingId(video.id);
    setEditForm({
      title: video.title,
      description: video.description || "",
      tags: video.tags || "",
      privacy: video.privacy,
      madeForKids: video.madeForKids,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (videoId: string) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });

      if (!res.ok) {
        throw new Error("Failed to update video metadata");
      }

      setEditingId(null);
      onNotification?.("Video details updated", "success");
      onRefresh();
    } catch (err: any) {
      onNotification?.(err.message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const retryVideo = async (videoId: string) => {
    try {
      const res = await fetch(`/api/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending" }),
      });
      if (res.ok) {
        onNotification?.("Queued video for retry", "info");
        onRefresh();
      }
    } catch (err: any) {
      onNotification?.("Failed to retry video", "error");
    }
  };

  const deleteVideo = async (videoId: string) => {
    if (!confirm("Are you sure you want to remove this video from queue?")) return;
    try {
      const res = await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
      if (res.ok) {
        onNotification?.("Video removed from queue", "info");
        onRefresh();
      }
    } catch (err: any) {
      onNotification?.("Failed to delete video", "error");
    }
  };

  const renderStatusBadge = (video: VideoItem) => {
    switch (video.status) {
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3.5 h-3.5" />
            Queued
          </span>
        );
      case "uploading":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Uploading ({video.progress}%)
          </span>
        );
      case "uploaded":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Uploaded
          </span>
        );
      case "failed":
        return (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 cursor-help"
            title={video.error || "Upload failed"}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            Failed
          </span>
        );
      case "paused":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
            Paused
          </span>
        );
    }
  };

  const renderPrivacyIcon = (privacy: string) => {
    switch (privacy) {
      case "public":
        return (
          <span title="Public">
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
          </span>
        );
      case "unlisted":
        return (
          <span title="Unlisted">
            <EyeOff className="w-3.5 h-3.5 text-blue-400" />
          </span>
        );
      case "private":
      default:
        return (
          <span title="Private">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Film className="w-5 h-5 text-indigo-400" />
          <h3 className="text-base font-semibold text-white">Video Upload Queue</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-medium">
            {videos.length} videos
          </span>
        </div>
      </div>

      {videos.length === 0 ? (
        <div className="p-12 text-center text-slate-400 space-y-2">
          <Film className="w-12 h-12 mx-auto text-slate-700" />
          <p className="text-sm font-medium text-slate-300">Your queue is empty</p>
          <p className="text-xs text-slate-500">
            Click "Select Videos from Drive" above to pick videos and start automating.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase font-medium tracking-wider">
              <tr>
                <th className="py-3 px-4 w-12 text-center">#</th>
                <th className="py-3 px-4 min-w-[240px]">Video Details</th>
                <th className="py-3 px-4 w-28">Privacy</th>
                <th className="py-3 px-4 w-28">Made for Kids</th>
                <th className="py-3 px-4 w-36">Status</th>
                <th className="py-3 px-4 w-28 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {videos.map((video, idx) => {
                const isEditing = editingId === video.id;

                return (
                  <tr
                    key={video.id}
                    className="hover:bg-slate-850/50 transition-colors group"
                  >
                    <td className="py-3.5 px-4 text-center font-mono text-slate-500 font-semibold">
                      {idx + 1}
                    </td>

                    <td className="py-3.5 px-4">
                      {isEditing ? (
                        <div className="space-y-2">
                          <div>
                            <label className="text-[10px] text-slate-400 uppercase font-semibold">
                              Title
                            </label>
                            <input
                              type="text"
                              value={editForm.title || ""}
                              onChange={(e) =>
                                setEditForm({ ...editForm, title: e.target.value })
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 uppercase font-semibold">
                              Description
                            </label>
                            <textarea
                              rows={2}
                              value={editForm.description || ""}
                              onChange={(e) =>
                                setEditForm({ ...editForm, description: e.target.value })
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 uppercase font-semibold">
                              Tags (comma-separated)
                            </label>
                            <input
                              type="text"
                              value={editForm.tags || ""}
                              onChange={(e) =>
                                setEditForm({ ...editForm, tags: e.target.value })
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3">
                          {video.thumbnailPath && (
                            <div className="relative w-11 h-16 rounded-lg overflow-hidden border border-amber-500/40 bg-slate-950 shrink-0 shadow-md">
                              <img
                                src={video.thumbnailPath}
                                alt="Thumbnail"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-white text-sm leading-snug">
                                {video.title}
                              </p>
                            {video.title.toLowerCase().includes("#short") ||
                            (video.tags && video.tags.toLowerCase().includes("short")) ||
                            video.fileName.toLowerCase().includes("reel") ||
                            video.fileName.toLowerCase().includes("short") ? (
                              <span className="shrink-0 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold">
                                ⚡ Short
                              </span>
                            ) : (
                              <span className="shrink-0 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-medium">
                                🎬 Video
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                            {video.driveFileId.startsWith("local:") && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-semibold">
                                ✂️ AI Clip
                              </span>
                            )}
                            <span className="truncate max-w-[200px]" title={video.fileName}>
                              📁 {video.fileName}
                            </span>
                            {video.fileSize && (
                              <>
                                <span>•</span>
                                <span>{video.fileSize}</span>
                              </>
                            )}
                          </div>
                          {video.youtubeVideoId && (
                            <a
                              href={`https://youtu.be/${video.youtubeVideoId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-red-400 hover:underline"
                            >
                              Watch on YouTube <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          {video.error && (
                            <p className="mt-1 text-[11px] text-red-400 truncate max-w-md">
                              Error: {video.error}
                            </p>
                          )}
                          </div>
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {isEditing ? (
                        <select
                          value={editForm.privacy || "private"}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              privacy: e.target.value as any,
                            })
                          }
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                        >
                          <option value="private">Private</option>
                          <option value="unlisted">Unlisted</option>
                          <option value="public">Public</option>
                        </select>
                      ) : (
                        <div className="flex items-center gap-1.5 capitalize text-slate-300">
                          {renderPrivacyIcon(video.privacy)}
                          <span>{video.privacy}</span>
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {isEditing ? (
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(editForm.madeForKids)}
                            onChange={(e) =>
                              setEditForm({ ...editForm, madeForKids: e.target.checked })
                            }
                            className="rounded bg-slate-950 border-slate-700 text-blue-600"
                          />
                          <span className="text-slate-300">Yes</span>
                        </label>
                      ) : (
                        <span className="text-slate-400">
                          {video.madeForKids ? "Yes" : "No"}
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">{renderStatusBadge(video)}</td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(video.id)}
                              disabled={isSaving}
                              className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                              title="Save Changes"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1.5 text-slate-400 hover:bg-slate-800 rounded-lg transition-colors"
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <>
                            {video.status === "failed" && (
                              <button
                                onClick={() => retryVideo(video.id)}
                                className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                                title="Retry Upload"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => startEdit(video)}
                              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                              title="Edit metadata"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteVideo(video.id)}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                              title="Remove from queue"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
