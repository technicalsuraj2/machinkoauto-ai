"use client";

import { useSession, signOut } from "next-auth/react";
import { Youtube, HardDrive, Sparkles, LogOut, ShieldAlert, Scissors } from "lucide-react";

interface NavbarProps {
  todayUploadCount: number;
  dailyLimit: number;
  onOpenAIGenerator: () => void;
  onOpenClipper: () => void;
}

export default function Navbar({
  todayUploadCount,
  dailyLimit,
  onOpenAIGenerator,
  onOpenClipper,
}: NavbarProps) {
  const { data: session } = useSession();

  // YouTube charges ~1600 units per video upload from 10,000 daily budget
  const estimatedUnits = todayUploadCount * 1600;
  const maxUnits = 10000;
  const isNearLimit = todayUploadCount >= dailyLimit - 1;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-red-600 to-rose-700 rounded-xl shadow-lg shadow-red-950/50 flex items-center justify-center">
            <Youtube className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-white tracking-tight">AutoTube</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
                Studio
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Drive-to-YouTube Streaming Automation
            </p>
          </div>
        </div>

        {/* Quota Meter & Actions */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden md:flex flex-col items-end">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              {isNearLimit ? (
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              ) : null}
              <span className="text-slate-400">YouTube Quota:</span>
              <span
                className={`font-semibold ${
                  isNearLimit ? "text-amber-400" : "text-emerald-400"
                }`}
              >
                {todayUploadCount} / {dailyLimit} uploads
              </span>
              <span className="text-slate-500 text-[11px]">
                (~{estimatedUnits.toLocaleString()} / {maxUnits.toLocaleString()} units)
              </span>
            </div>
            <div className="w-48 bg-slate-800 rounded-full h-1.5 mt-1 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  isNearLimit ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{
                  width: `${Math.min(100, (todayUploadCount / dailyLimit) * 100)}%`,
                }}
              />
            </div>
          </div>

          <button
            onClick={onOpenClipper}
            className="flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-red-950/40 ring-1 ring-amber-400/40 transition-all hover:scale-[1.03] animate-pulse-subtle"
          >
            <Scissors className="w-4 h-4 text-amber-200" />
            <span className="hidden sm:inline">✂️ YouTube Clipper</span>
            <span className="sm:hidden">✂️ Clipper</span>
          </button>

          <button
            onClick={onOpenAIGenerator}
            className="flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs sm:text-sm font-medium shadow-md shadow-indigo-900/20 transition-all hover:scale-[1.02]"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span className="hidden sm:inline">AI Video Generator</span>
            <span className="sm:hidden">AI Gen</span>
          </button>

          {session?.user ? (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || "User"}
                  className="w-8 h-8 rounded-full border border-slate-700 object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300">
                  {session.user.name?.charAt(0) || "U"}
                </div>
              )}
              <button
                onClick={() => signOut({ callbackUrl: "/auth/signin" })}
                title="Sign out"
                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-900 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
