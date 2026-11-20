"use client";

import { useState } from "react";
import { Play, Pause, Square, Clock, Settings, Loader2, Sparkles, CheckCircle, AlertCircle } from "lucide-react";

export interface AutomationStatusData {
  settings: {
    isRunning: boolean;
    gapMinutes: number;
    dailyLimit: number;
    lastUploadedAt?: string | null;
    todayUploadCount: number;
    quotaPausedUntil?: string | null;
  };
  activeVideo?: {
    id: string;
    title: string;
    fileName: string;
    progress: number;
    fileSize?: string;
  } | null;
  counts: {
    pending: number;
    uploading: number;
    uploaded: number;
    failed: number;
    paused: number;
    total: number;
  };
}

interface AutomationBarProps {
  status: AutomationStatusData | null;
  onRefresh: () => void;
  onNotification?: (msg: string, type: "success" | "error" | "info") => void;
}

export default function AutomationBar({
  status,
  onRefresh,
  onNotification,
}: AutomationBarProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [gapMinutes, setGapMinutes] = useState(status?.settings.gapMinutes !== undefined ? status.settings.gapMinutes : 0);
  const [dailyLimit, setDailyLimit] = useState(status?.settings.dailyLimit || 10);

  const isRunning = Boolean(status?.settings.isRunning);
  const isQuotaPaused = Boolean(
    status?.settings.quotaPausedUntil && new Date(status.settings.quotaPausedUntil) > new Date()
  );

  const handleAction = async (action: "start" | "pause" | "resume" | "stop") => {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/automation/${action}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to ${action} automation`);
      }
      onNotification?.(`Automation ${action}ed successfully`, "success");
      onRefresh();
    } catch (err: any) {
      onNotification?.(err.message, "error");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    try {
      const res = await fetch("/api/automation/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapMinutes, dailyLimit }),
      });
      if (res.ok) {
        setShowSettingsModal(false);
        onNotification?.("Automation settings updated", "success");
        onRefresh();
      }
    } catch (err: any) {
      onNotification?.("Failed to update settings", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Status Indicator */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div
              className={`w-3.5 h-3.5 rounded-full ${
                isRunning
                  ? "bg-emerald-500 animate-ping absolute inset-0 opacity-75"
                  : "hidden"
              }`}
            />
            <div
              className={`w-3.5 h-3.5 rounded-full ${
                isRunning
                  ? "bg-emerald-500"
                  : isQuotaPaused
                  ? "bg-amber-500"
                  : "bg-slate-600"
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white text-base">
                {isRunning ? "Automation Engine: ACTIVE" : "Automation Engine: STOPPED"}
              </span>
              {status?.settings.gapMinutes === 0 ? (
                <span className="text-[11px] px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-full font-semibold">
                  ⚡ Fast Mode (0s delay)
                </span>
              ) : null}
              {isQuotaPaused && (
                <span className="text-[11px] px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full font-medium">
                  Paused for Pacific Midnight Quota Reset
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {status?.settings.gapMinutes === 0
                ? "Immediate consecutive uploads"
                : `Gap: ${status?.settings.gapMinutes || 0} mins`}{" "}
              • Daily Limit: {status?.settings.dailyLimit || 10} uploads • Pending:{" "}
              {status?.counts.pending || 0}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {isRunning ? (
            <>
              <button
                onClick={() => handleAction("pause")}
                disabled={isUpdating}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-600/90 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold shadow-md shadow-amber-900/20 transition-all disabled:opacity-50"
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
              <button
                onClick={() => handleAction("stop")}
                disabled={isUpdating}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-red-400 rounded-xl text-xs font-semibold border border-red-500/20 transition-all disabled:opacity-50"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
            </>
          ) : (
            <button
              onClick={() => handleAction("start")}
              disabled={isUpdating || (status?.counts.pending === 0 && !status?.activeVideo)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-900/30 transition-all disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              Start Upload Automation
            </button>
          )}

          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition-colors"
            title="Automation Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Active Upload Live Banner */}
      {status?.activeVideo && (
        <div className="bg-slate-950/80 border border-blue-500/30 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-blue-400 font-medium">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>Streaming to YouTube:</span>
              <span className="text-white font-semibold truncate max-w-xs sm:max-w-md">
                {status.activeVideo.title}
              </span>
            </div>
            <span className="text-blue-300 font-bold">{status.activeVideo.progress}%</span>
          </div>

          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${status.activeVideo.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-semibold text-white">Automation Queue Settings</h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-medium">
                    Gap Between Uploads (Minutes)
                  </label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setGapMinutes(0)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        gapMinutes === 0
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      ⚡ 0m (Fast)
                    </button>
                    <button
                      type="button"
                      onClick={() => setGapMinutes(5)}
                      className={`px-2 py-0.5 rounded text-[10px] ${
                        gapMinutes === 5
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      5m
                    </button>
                    <button
                      type="button"
                      onClick={() => setGapMinutes(15)}
                      className={`px-2 py-0.5 rounded text-[10px] ${
                        gapMinutes === 15
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      15m
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  min="0"
                  max="1440"
                  value={gapMinutes}
                  onChange={(e) => setGapMinutes(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  required
                />
                <p className="text-slate-500 text-[11px] mt-1">
                  Set to 0 for instant back-to-back uploads as soon as the previous video finishes.
                </p>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Daily Upload Limit
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  required
                />
                <p className="text-slate-500 text-[11px] mt-1">
                  Maximum videos allowed per day (Default 10,000 units quota allows ~6 uploads, higher if quota increased).
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-3.5 py-2 bg-slate-800 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg"
                >
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
