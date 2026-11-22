"use client";

import React, { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Search, Crown, Bell, ChevronDown, Youtube, LogOut } from "lucide-react";
import { ConnectionInfo } from "./ConnectionCards";

interface AutoClipHeaderProps {
  connections: ConnectionInfo[];
  onOpenClipper: () => void;
}

export default function AutoClipHeader({ connections, onOpenClipper }: AutoClipHeaderProps) {
  const { data: session } = useSession();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const youtubeConn = connections.find((c) => c.provider === "youtube" || c.provider.startsWith("youtube"));
  const channelName = youtubeConn?.channelName || "AutoClip Studio";

  return (
    <header className="h-16 px-6 bg-[#0B0813]/90 backdrop-blur-md border-b border-[#201538] flex items-center justify-between gap-4 sticky top-0 z-20">
      {/* Search Input Bar (Pill shape) */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search anything... (Ctrl + K)"
          className="w-full pl-10 pr-4 py-2 bg-[#140E26] border border-purple-900/30 rounded-full text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all shadow-inner"
        />
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-3.5">
        {/* Pro Plan Golden Badge Button */}
        <button
          onClick={onOpenClipper}
          className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.2)] hover:bg-amber-500/20 transition-all"
        >
          <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
          <span>Pro Plan</span>
        </button>

        {/* Notification Bell with Badge */}
        <div className="relative">
          <button className="p-2 rounded-full bg-[#140E26] border border-purple-900/30 text-slate-300 hover:text-white transition-colors">
            <Bell className="w-4 h-4" />
          </button>
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center border-2 border-[#0B0813]">
            2
          </span>
        </div>

        {/* User Profile Pill */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-full bg-[#140E26] border border-purple-900/30 hover:border-purple-500/40 transition-all"
          >
            {/* Avatar with YouTube Mini Badge */}
            <div className="relative">
              {session?.user?.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || "User"}
                  className="w-8 h-8 rounded-full object-cover border border-purple-500/50"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-purple-900/80 text-purple-200 border border-purple-500/50 flex items-center justify-center font-bold text-xs">
                  {session?.user?.name?.[0]?.toUpperCase() || "A"}
                </div>
              )}
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-red-600 rounded-full flex items-center justify-center border border-[#0B0813]">
                <Youtube className="w-2 h-2 text-white fill-white" />
              </div>
            </div>

            <div className="text-left hidden sm:block">
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-white leading-none">
                  {session?.user?.name || "Anjali Patel"}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </div>
              <span className="text-[10px] text-purple-300/70 font-medium">
                YT: {channelName}
              </span>
            </div>
          </button>

          {/* User Dropdown */}
          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-[#140E26] border border-purple-800/60 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-2 border-b border-purple-900/40">
                <p className="text-xs font-bold text-white truncate">
                  {session?.user?.name}
                </p>
                <p className="text-[10px] text-slate-400 truncate">
                  {session?.user?.email}
                </p>
              </div>

              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="w-full mt-1 px-3 py-2 text-left text-xs font-semibold text-red-400 hover:bg-red-950/30 rounded-lg flex items-center gap-2 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
