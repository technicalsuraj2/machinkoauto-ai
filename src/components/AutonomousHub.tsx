"use client";

import React, { useState, useEffect } from "react";
import {
  Bot,
  Flame,
  Database,
  Calendar,
  Send,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  RefreshCw,
  Cpu,
  Clock,
  Youtube,
  ShieldCheck,
} from "lucide-react";

interface AutonomousHubProps {
  onRefresh?: () => void;
  onNotification?: (msg: string, type: "success" | "error" | "info") => void;
}

export default function AutonomousHub({ onRefresh, onNotification }: AutonomousHubProps) {
  const [isHarvesting, setIsHarvesting] = useState(false);
  const [integrationsStatus, setIntegrationsStatus] = useState<{
    firebase: { configured: boolean; target: string; lastSyncCount: number };
    telegram: { configured: boolean; botUsername: string; chatIdSet: boolean };
    automation: { isRunning: boolean; dailyLimit: number; todayUploadCount: number; lastUploadedAt: string | null };
  } | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/integrations/status");
      if (res.ok) {
        const data = await res.json();
        setIntegrationsStatus(data);
      }
    } catch (err) {
      // Quiet fail
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleHarvest = async () => {
    setIsHarvesting(true);
    try {
      const res = await fetch("/api/automation/harvest", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        if (onNotification) {
          onNotification(
            "Autonomous GTA 5 Pipeline started! AI is sourcing YouTube & generating 10 viral clips.",
            "success"
          );
        }
        if (onRefresh) onRefresh();
      } else {
        throw new Error(data.error || "Failed to start autonomous pipeline");
      }
    } catch (err: any) {
      if (onNotification) onNotification(err.message, "error");
    } finally {
      setTimeout(() => setIsHarvesting(false), 2000);
    }
  };

  const handleCalendarReminder = async () => {
    try {
      const res = await fetch("/api/calendar/reminder", { method: "POST" });
      const data = await res.json();
      const calendarUrl =
        data.eventUrl ||
        "https://calendar.google.com/calendar/render?action=TEMPLATE&text=MachinkoAuto.Ai%3A+Upload+10+YouTube+Shorts+Daily&details=24-Hour+cycle%3A+Upload+10+viral+GTA+5+Shorts+to+YouTube&recur=RRULE:FREQ=DAILY";
      window.open(calendarUrl, "_blank", "noopener,noreferrer");
      if (onNotification) onNotification("Opened Google Calendar 24h Reminder event!", "success");
    } catch {
      window.open(
        "https://calendar.google.com/calendar/render?action=TEMPLATE&text=MachinkoAuto.Ai%3A+Upload+10+YouTube+Shorts+Daily&details=24-Hour+cycle%3A+Upload+10+viral+GTA+5+Shorts+to+YouTube&recur=RRULE:FREQ=DAILY",
        "_blank"
      );
    }
  };

  const fbConfigured = integrationsStatus?.firebase?.configured ?? false;
  const tgConfigured = integrationsStatus?.telegram?.configured ?? false;
  const todayCount = integrationsStatus?.automation?.todayUploadCount ?? 0;
  const dailyLimit = integrationsStatus?.automation?.dailyLimit ?? 10;

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 rounded-xl text-amber-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wide">
                24/7 Autonomous GTA 5 Engine & Cloud Sync Hub
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live 24h Pipeline
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Auto-sources 1 GTA 5 video (&lt;1 hr), generates 10 Hormozi Shorts (9:16), queues uploads, syncs to Firebase & Telegram.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleHarvest}
            disabled={isHarvesting}
            className="flex-1 sm:flex-initial px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40 transition-all disabled:opacity-50"
          >
            {isHarvesting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Flame className="w-3.5 h-3.5 fill-slate-950" />
            )}
            <span>{isHarvesting ? "Starting AI Harvest..." : "Harvest 10 GTA 5 Clips Now"}</span>
          </button>

          <button
            onClick={handleCalendarReminder}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs flex items-center gap-1.5 transition-all"
            title="Add 24-hour reminder to Google Calendar"
          >
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden md:inline">24h Calendar Reminder</span>
          </button>
        </div>
      </div>

      {/* 3 Modular Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: 24/7 GTA 5 Pipeline */}
        <div className="bg-slate-950/60 border border-slate-800/90 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Youtube className="w-4 h-4 text-red-500" />
                Autonomous YouTube Sourcing
              </span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                Daily Limit: {todayCount}/{dailyLimit}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Every 24 hours, the AI pipeline finds a top trending GTA 5 gameplay video, cuts 10 viral 9:16 Shorts with burned-in animated captions, attaches high-CTR thumbnails, and pushes directly to your upload queue.
            </p>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
            <span className="text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-amber-400" />
              Auto-Reset:
            </span>
            <span className="font-mono text-slate-200 font-medium">Every 24 Hours</span>
          </div>
        </div>

        {/* Card 2: Firebase Database */}
        <div className="bg-slate-950/60 border border-slate-800/90 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-amber-400" />
                Firebase Cloud Database
              </span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 border ${
                  fbConfigured
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                }`}
              >
                {fbConfigured ? (
                  <>
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    Connected
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-2.5 h-2.5" />
                    Waiting Config
                  </>
                )}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Logs every uploaded video (YouTube ID, title, duration in seconds, uploaded timestamp) to Firebase Realtime Database or Firestore, keeping your local machine at 0-Storage!
            </p>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Target DB:</span>
            <span className="font-mono text-amber-300 truncate max-w-[150px]">
              {integrationsStatus?.firebase?.target || "Realtime DB / Firestore"}
            </span>
          </div>
        </div>

        {/* Card 3: Telegram AI Assistant */}
        <div className="bg-slate-950/60 border border-slate-800/90 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Send className="w-4 h-4 text-sky-400" />
                Telegram AI Bot
              </span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 border ${
                  tgConfigured
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : "bg-sky-500/20 text-sky-300 border-sky-500/30"
                }`}
              >
                {tgConfigured ? (
                  <>
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    Active Webhook
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-2.5 h-2.5" />
                    Waiting Bot Token
                  </>
                )}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Chat directly with your AI in Hindi or English on Telegram! Ask questions like:
            </p>
            <div className="mt-1.5 space-y-1 text-[10px] text-slate-300 font-mono bg-slate-900/80 p-2 rounded border border-slate-800">
              <div className="text-sky-300">💬 &quot;Kitne sub huye he?&quot;</div>
              <div className="text-amber-300">💬 &quot;Aaj kitne video upload huye?&quot;</div>
              <div className="text-emerald-300">💬 &quot;Queue status kya he?&quot;</div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Webhook:</span>
            <span className="font-mono text-sky-300">/api/telegram/webhook</span>
          </div>
        </div>
      </div>
    </div>
  );
}
