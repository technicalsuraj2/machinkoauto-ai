"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import QuotaNotice from "@/components/QuotaNotice";
import ConnectionCards, { ConnectionInfo } from "@/components/ConnectionCards";
import DriveVideoPicker from "@/components/DriveVideoPicker";
import AutomationBar, { AutomationStatusData } from "@/components/AutomationBar";
import VideoTable, { VideoItem } from "@/components/VideoTable";
import AIGeneratorModal from "@/components/AIGeneratorModal";
import ClipperModal from "@/components/ClipperModal";
import LogsPanel, { LogItem } from "@/components/LogsPanel";
import AutonomousHub from "@/components/AutonomousHub";
import { Loader2, ArrowRight, ShieldCheck, Youtube, CheckCircle2, AlertCircle } from "lucide-react";

function DashboardContent() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [automationStatus, setAutomationStatus] = useState<AutomationStatusData | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);

  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
  const [isAIGeneratorOpen, setIsAIGeneratorOpen] = useState(false);
  const [isClipperOpen, setIsClipperOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Show notification toast
  const showNotification = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 5000);
  }, []);

  // Check URL query parameters for OAuth callbacks
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");

    if (connected) {
      showNotification(`Successfully connected ${connected.toUpperCase()}!`, "success");
      router.replace("/");
    } else if (error) {
      showNotification(error, "error");
      router.replace("/");
    }
  }, [searchParams, router, showNotification]);

  // Fetch all dashboard data
  const fetchData = useCallback(async () => {
    if (!session?.user) return;

    try {
      const [connRes, autoRes, vidRes, logsRes] = await Promise.all([
        fetch("/api/connections"),
        fetch("/api/automation/status"),
        fetch("/api/videos"),
        fetch("/api/logs"),
      ]);

      if (connRes.ok) {
        const data = await connRes.json();
        setConnections(data.connections || []);
      }

      if (autoRes.ok) {
        const data = await autoRes.json();
        setAutomationStatus(data);
      }

      if (vidRes.ok) {
        const data = await vidRes.json();
        setVideos(data.videos || []);
      }

      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    }
  }, [session]);

  useEffect(() => {
    if (session?.user) {
      fetchData();
      // Poll every 4 seconds for live progress tracking
      const interval = setInterval(fetchData, 4000);
      return () => clearInterval(interval);
    }
  }, [session, fetchData]);

  // Loading state
  if (authStatus === "loading") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-red-500" />
          <p className="text-sm font-medium">Loading AutoTube Studio...</p>
        </div>
      </div>
    );
  }

  // Not authenticated view
  if (!session?.user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-3xl text-red-500 mb-6 shadow-xl">
          <Youtube className="w-14 h-14" />
        </div>
        <h1 className="text-4xl font-extrabold text-white tracking-tight sm:text-5xl">
          AutoTube <span className="text-red-500">Studio</span>
        </h1>
        <p className="mt-3 text-base text-slate-400 max-w-md">
          Autonomous Google Drive to YouTube Cloud Streaming Pipeline with AI Video Clipper.
        </p>

        <button
          onClick={() => router.push("/auth/signin")}
          className="mt-8 px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl text-sm flex items-center gap-2 shadow-lg shadow-red-900/30 transition-all hover:scale-105"
        >
          Sign in to Dashboard
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <Navbar
        todayUploadCount={automationStatus?.settings?.todayUploadCount || 0}
        dailyLimit={automationStatus?.settings?.dailyLimit || 10}
        onOpenAIGenerator={() => setIsAIGeneratorOpen(true)}
        onOpenClipper={() => setIsClipperOpen(true)}
      />

      {/* Floating Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-xs font-medium border animate-in slide-in-from-bottom-5 duration-300 ${
            toast.type === "success"
              ? "bg-emerald-950 border-emerald-500/50 text-emerald-200"
              : toast.type === "error"
              ? "bg-red-950 border-red-500/50 text-red-200"
              : "bg-blue-950 border-blue-500/50 text-blue-200"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Dashboard Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Compliance & Quota Notice */}
        <QuotaNotice />

        {/* OAuth Connection Cards (Google Drive & YouTube Channel with Switch Account) */}
        <ConnectionCards
          connections={connections}
          onRefresh={fetchData}
          onOpenFolderPicker={() => setIsDrivePickerOpen(true)}
        />

        {/* 24/7 Autonomous GTA 5 Harvester & Integrations Hub (Firebase, Telegram, Google Calendar) */}
        <AutonomousHub
          onRefresh={fetchData}
          onNotification={showNotification}
        />

        {/* Automation Engine Controls */}
        <AutomationBar
          status={automationStatus}
          onRefresh={fetchData}
          onNotification={showNotification}
        />

        {/* Video Queue Table */}
        <VideoTable
          videos={videos}
          onRefresh={fetchData}
          onNotification={showNotification}
        />

        {/* System Activity & Logs */}
        <LogsPanel logs={logs} onRefresh={fetchData} />
      </main>

      {/* Google Drive Video Picker Modal */}
      <DriveVideoPicker
        isOpen={isDrivePickerOpen}
        onClose={() => setIsDrivePickerOpen(false)}
        onVideosImported={() => {
          showNotification("Selected videos added to upload queue!", "success");
          fetchData();
        }}
      />

      {/* AI Video Generator Modal */}
      <AIGeneratorModal
        isOpen={isAIGeneratorOpen}
        onClose={() => setIsAIGeneratorOpen(false)}
        onJobCreated={fetchData}
        onNotification={showNotification}
      />

      {/* YouTube Video Clipper Modal (Agnes AI Clickbait Thumbnails & Auto Captions) */}
      <ClipperModal
        isOpen={isClipperOpen}
        onClose={() => setIsClipperOpen(false)}
        onClipsQueued={() => {
          showNotification("Clipped video(s) added to upload queue!", "success");
          fetchData();
        }}
        onNotification={showNotification}
      />
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-red-500" />
            <p className="text-sm">Loading AutoTube Studio...</p>
          </div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
