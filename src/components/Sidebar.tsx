"use client";

import React from "react";
import { useSession, signOut } from "next-auth/react";
import {
  Scissors,
  LayoutDashboard,
  Film,
  HardDrive,
  Sparkles,
  Terminal,
  LogOut,
  Youtube,
  Zap,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { ConnectionInfo } from "./ConnectionCards";

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  connections: ConnectionInfo[];
  todayUploadCount: number;
  dailyLimit: number;
  queueCount: number;
  onOpenClipper: () => void;
  onOpenDrivePicker: () => void;
  onOpenAIGenerator: () => void;
  onRefreshConnections: () => void;
}

export default function Sidebar({
  currentTab,
  onSelectTab,
  connections,
  todayUploadCount,
  dailyLimit,
  queueCount,
  onOpenClipper,
  onOpenDrivePicker,
  onOpenAIGenerator,
  onRefreshConnections,
}: SidebarProps) {
  const { data: session } = useSession();

  const youtubeConn = connections.find((c) => c.provider === "youtube" || c.provider.startsWith("youtube"));
  const driveConn = connections.find((c) => c.provider === "drive");

  const isYouTubeConnected = youtubeConn?.status === "connected";
  const isDriveConnected = driveConn?.status === "connected";

  const handleConnect = (provider: "youtube" | "drive") => {
    window.location.href = `/api/auth/connect/${provider}`;
  };

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "queue", label: "Video Queue", icon: Film, badge: queueCount > 0 ? String(queueCount) : undefined },
    { id: "logs", label: "System Logs", icon: Terminal },
  ];

  return (
    <aside className="w-64 bg-[#090b0e] border-r border-emerald-950/40 flex flex-col justify-between shrink-0 select-none shadow-2xl relative z-30 min-h-screen">
      {/* Top Brand & Connect Section */}
      <div className="p-4 space-y-6">
        {/* Brand Logo - MachinkoAuto.Ai (Higgsfield AI Style) */}
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 via-green-400 to-yellow-400 p-0.5 shadow-[0_0_20px_rgba(16,185,129,0.35)] flex items-center justify-center">
              <div className="w-full h-full bg-[#090b0e] rounded-[10px] flex items-center justify-center">
                <Zap className="w-5 h-5 text-emerald-400 fill-emerald-400/20 animate-pulse" />
              </div>
            </div>
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full border-2 border-[#090b0e] animate-ping" />
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-extrabold text-base tracking-tight text-white font-sans">
                MachinkoAuto<span className="text-emerald-400 font-mono">.Ai</span>
              </h1>
            </div>
            <p className="text-[10px] text-yellow-400/80 font-medium tracking-wider uppercase flex items-center gap-1">
              <span>Autonomous Studio</span>
              <span className="inline-block w-1 h-1 rounded-full bg-emerald-400" />
              <span>v2.0</span>
            </p>
          </div>
        </div>

        {/* PRIMARY CTA: YouTube Clipper */}
        <div className="px-1">
          <button
            onClick={onOpenClipper}
            className="w-full py-2.5 px-3 bg-gradient-to-r from-emerald-500 via-green-500 to-yellow-400 hover:from-emerald-400 hover:to-yellow-300 text-slate-950 font-extrabold text-xs rounded-xl shadow-[0_0_25px_rgba(16,185,129,0.3)] flex items-center justify-between group transition-all transform hover:scale-[1.02]"
          >
            <span className="flex items-center gap-2">
              <Scissors className="w-4 h-4 text-slate-950 fill-slate-950/20" />
              <span>✂️ YouTube Clipper</span>
            </span>
            <span className="px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-mono font-bold text-yellow-300 uppercase tracking-wider">
              AI VIRAL
            </span>
          </button>
        </div>

        {/* COMPACT CLOUD CONNECT BUTTONS (YouTube & Drive) */}
        <div className="space-y-2 pt-1 border-t border-slate-800/60">
          <div className="px-2 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Cloud Accounts
            </span>
            <span className="text-[10px] font-mono text-emerald-400">
              {isYouTubeConnected && isDriveConnected ? "2/2 ACTIVE" : "CONNECT"}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            {/* YouTube Connect Button */}
            <button
              onClick={() => handleConnect("youtube")}
              className={`w-full px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all border ${
                isYouTubeConnected
                  ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/40"
                  : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white hover:border-red-500/50"
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <Youtube className={`w-3.5 h-3.5 shrink-0 ${isYouTubeConnected ? "text-red-400" : "text-slate-500"}`} />
                <span className="truncate">
                  {isYouTubeConnected
                    ? youtubeConn?.channelName || "YouTube Connected"
                    : "Connect YouTube"}
                </span>
              </span>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isYouTubeConnected ? "bg-emerald-400 shadow-[0_0_8px_#10b981]" : "bg-yellow-400"
                }`}
              />
            </button>

            {/* Google Drive Connect Button */}
            <button
              onClick={() => handleConnect("drive")}
              className={`w-full px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all border ${
                isDriveConnected
                  ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/40"
                  : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white hover:border-blue-500/50"
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <HardDrive className={`w-3.5 h-3.5 shrink-0 ${isDriveConnected ? "text-blue-400" : "text-slate-500"}`} />
                <span className="truncate">
                  {isDriveConnected ? "Drive Connected" : "Connect Drive"}
                </span>
              </span>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isDriveConnected ? "bg-emerald-400 shadow-[0_0_8px_#10b981]" : "bg-yellow-400"
                }`}
              />
            </button>
          </div>
        </div>

        {/* NAVIGATION LINKS */}
        <div className="space-y-1 pt-1">
          <div className="px-2 pb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Studio Navigation
            </span>
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all ${
                  isActive
                    ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50 border border-transparent"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? "text-emerald-400" : "text-slate-500"}`} />
                  <span>{item.label}</span>
                </span>
                {item.badge && (
                  <span className="px-1.5 py-0.2 rounded-full bg-yellow-400/20 text-yellow-300 border border-yellow-400/30 text-[10px] font-mono font-bold">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Quick Drive Picker Link */}
          <button
            onClick={onOpenDrivePicker}
            className="w-full px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-900/50 flex items-center gap-2.5 transition-all"
          >
            <Film className="w-4 h-4 text-blue-400" />
            <span>Select Drive Videos</span>
          </button>

          {/* Quick AI Generator Link */}
          <button
            onClick={onOpenAIGenerator}
            className="w-full px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-900/50 flex items-center gap-2.5 transition-all"
          >
            <Sparkles className="w-4 h-4 text-yellow-400" />
            <span>AI Video Generator</span>
          </button>
        </div>
      </div>

      {/* Bottom Quota & Profile Widget (Higgsfield AI Style) */}
      <div className="p-4 space-y-3 border-t border-slate-800/80 bg-[#07090c]/80">
        {/* Credits & Quota Card */}
        <div className="p-3 bg-gradient-to-b from-slate-900/80 to-slate-950 border border-emerald-500/20 rounded-xl space-y-2 shadow-inner">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <Zap className="w-3 h-3 text-yellow-400" />
              <span>AI Credits</span>
            </span>
            <span className="font-mono font-bold text-emerald-400">850 / 1000</span>
          </div>

          <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
            <div className="bg-gradient-to-r from-emerald-500 to-yellow-400 h-full w-[85%] rounded-full shadow-[0_0_8px_#10b981]" />
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
            <span>YouTube Quota:</span>
            <span className="font-mono text-yellow-300 font-semibold">
              {todayUploadCount}/{dailyLimit} Uploads
            </span>
          </div>

          <div className="pt-1 text-[9px] text-emerald-400/90 font-mono flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Zero-Storage Mode: Active</span>
          </div>
        </div>

        {/* User Profile */}
        {session?.user && (
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2 min-w-0">
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || "User"}
                  className="w-7 h-7 rounded-full border border-emerald-500/40"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-300 flex items-center justify-center font-bold text-xs">
                  {session.user.name?.[0]?.toUpperCase() || "U"}
                </div>
              )}
              <div className="truncate">
                <p className="text-xs font-semibold text-white truncate max-w-[120px]">
                  {session.user.name}
                </p>
                <p className="text-[10px] text-slate-500 truncate max-w-[120px]">
                  {session.user.email}
                </p>
              </div>
            </div>

            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              title="Sign Out"
              className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-900 rounded-lg transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
