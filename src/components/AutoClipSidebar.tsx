"use client";

import React, { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  FolderKanban,
  LayoutGrid,
  BarChart3,
  Link2,
  Settings,
  Crown,
  Rocket,
  Sun,
  Moon,
  Scissors,
  HardDrive,
  Youtube,
  Play,
  ArrowRight,
} from "lucide-react";

interface AutoClipSidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onOpenClipper: () => void;
  onOpenDrivePicker: () => void;
  onOpenSettings: () => void;
}

export default function AutoClipSidebar({
  currentTab,
  onSelectTab,
  onOpenClipper,
  onOpenDrivePicker,
  onOpenSettings,
}: AutoClipSidebarProps) {
  const { data: session } = useSession();
  const [isDarkMode, setIsDarkMode] = useState(true);

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "projects", label: "My Projects", icon: FolderKanban, action: onOpenDrivePicker },
    { id: "clipper", label: "Auto Clipper", icon: Scissors, action: onOpenClipper, highlight: true },
    { id: "templates", label: "Templates", icon: LayoutGrid, action: onOpenClipper },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "connections", label: "Connections", icon: Link2, badge: "New" },
    { id: "settings", label: "Settings", icon: Settings, action: onOpenSettings },
    { id: "upgrade", label: "Upgrade", icon: Crown, isGold: true },
  ];

  return (
    <aside className="w-64 bg-[#0B0813] border-r border-[#201538] flex flex-col justify-between shrink-0 select-none shadow-2xl relative z-30 min-h-screen">
      {/* Top Brand & Nav */}
      <div className="p-4 space-y-6">
        {/* Brand Logo - AutoClip AI */}
        <div className="flex items-center gap-3 px-2 py-2">
          {/* Glowing 3D Purple Play Logo */}
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-fuchsia-500 to-indigo-500 p-0.5 shadow-[0_0_20px_rgba(168,85,247,0.5)] flex items-center justify-center">
              <div className="w-full h-full bg-[#120B24] rounded-[10px] flex items-center justify-center">
                <Play className="w-5 h-5 text-purple-400 fill-purple-400 ml-0.5" />
              </div>
            </div>
            <div className="absolute -inset-1 rounded-xl bg-purple-500/20 blur-md pointer-events-none" />
          </div>

          <div>
            <h1 className="font-extrabold text-base tracking-tight text-white flex items-center gap-1 font-sans">
              AutoClip <span className="text-purple-400">AI</span>
            </h1>
            <p className="text-[10px] text-purple-300/60 font-medium tracking-wide">
              Clip • Automate • Grow
            </p>
          </div>
        </div>

        {/* Navigation List */}
        <nav className="space-y-1.5 pt-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.action) {
                    item.action();
                  } else {
                    onSelectTab(item.id);
                  }
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-purple-600/90 to-fuchsia-600/80 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]"
                    : item.highlight
                    ? "text-purple-300 hover:text-white bg-purple-950/30 hover:bg-purple-900/40 border border-purple-500/30"
                    : item.isGold
                    ? "text-amber-300 hover:text-amber-200 hover:bg-amber-950/20"
                    : "text-slate-400 hover:text-white hover:bg-[#160F2B]"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive
                        ? "text-white"
                        : item.isGold
                        ? "text-amber-400"
                        : item.highlight
                        ? "text-purple-400"
                        : "text-slate-400"
                    }`}
                  />
                  <span>{item.label}</span>
                </span>

                {item.badge && (
                  <span className="px-2 py-0.5 rounded-full bg-purple-600 text-white text-[9px] font-bold tracking-wider uppercase shadow-[0_0_10px_rgba(168,85,247,0.6)]">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Pro Card & Theme Switcher */}
      <div className="p-4 space-y-4">
        {/* Upgrade to Pro Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-b from-[#181033] to-[#120B24] border border-purple-500/30 shadow-[0_0_25px_rgba(168,85,247,0.15)] relative overflow-hidden text-center space-y-3">
          <div className="absolute top-0 right-0 -mr-6 -mt-6 w-24 h-24 rounded-full bg-purple-500/20 blur-xl pointer-events-none" />

          {/* Glowing Rocket Icon */}
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 mx-auto flex items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.4)]">
            <Rocket className="w-5 h-5 text-purple-300 fill-purple-400/20" />
          </div>

          <div>
            <h4 className="text-xs font-bold text-white tracking-wide">
              Upgrade to Pro
            </h4>
            <p className="text-[10px] text-purple-200/70 mt-1 leading-relaxed">
              Unlock unlimited clips & premium features.
            </p>
          </div>

          <button
            onClick={onOpenClipper}
            className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-500 to-indigo-500 hover:from-purple-500 hover:to-indigo-400 text-white text-xs font-bold shadow-[0_0_15px_rgba(168,85,247,0.4)] flex items-center justify-center gap-1.5 transition-all transform hover:scale-[1.02]"
          >
            <span>Go Pro</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Theme Toggle Button (Sun/Moon pill) */}
        <div className="flex items-center justify-start pl-1">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-1.5 bg-[#160F2B] border border-purple-900/40 rounded-full flex items-center gap-2 text-slate-400 hover:text-white transition-all shadow-inner"
          >
            <div
              className={`p-1 rounded-full transition-all ${
                !isDarkMode ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-500"
              }`}
            >
              <Sun className="w-3 h-3" />
            </div>
            <div
              className={`p-1 rounded-full transition-all ${
                isDarkMode ? "bg-purple-600 text-white shadow-sm" : "text-slate-500"
              }`}
            >
              <Moon className="w-3 h-3" />
            </div>
          </button>
        </div>
      </div>
    </aside>
  );
}
