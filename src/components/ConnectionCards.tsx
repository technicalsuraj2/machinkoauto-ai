"use client";

import { HardDrive, Youtube, CheckCircle2, AlertTriangle, XCircle, RefreshCw, ExternalLink, Unlink, Plus, FolderCheck, Save } from "lucide-react";
import { useState, useEffect } from "react";

export interface ConnectionInfo {
  id: string;
  provider: string;
  channelName?: string | null;
  channelId?: string | null;
  status: "connected" | "needs_reconnect" | "disconnected";
  updatedAt: string;
}

interface ConnectionCardsProps {
  connections: ConnectionInfo[];
  onRefresh: () => void;
  onOpenFolderPicker: () => void;
}

export default function ConnectionCards({
  connections,
  onRefresh,
  onOpenFolderPicker,
}: ConnectionCardsProps) {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [driveFolderId, setDriveFolderId] = useState("");
  const [driveFolderName, setDriveFolderName] = useState("");
  const [isSavingFolder, setIsSavingFolder] = useState(false);
  const [folderSaveSuccess, setFolderSaveSuccess] = useState(false);

  const driveConn = connections.find((c) => c.provider === "drive");
  const youtubeConnections = connections.filter((c) => c.provider.startsWith("youtube"));

  // Load configured drive folder on mount
  useEffect(() => {
    fetch("/api/drive/config")
      .then((res) => res.json())
      .then((data) => {
        if (data?.config?.folderId) {
          setDriveFolderId(data.config.folderId);
          setDriveFolderName(data.config.folderName || "5,000 Videos Folder");
        }
      })
      .catch(() => {});
  }, []);

  const handleConnect = (provider: "drive" | "youtube") => {
    setLoadingProvider(provider);
    window.location.href = `/api/connect/${provider}`;
  };

  const handleDisconnect = async (provider: string, label: string) => {
    if (!confirm(`Are you sure you want to disconnect ${label}?`)) {
      return;
    }
    setLoadingProvider(provider);
    try {
      const res = await fetch(`/api/connections/${encodeURIComponent(provider)}`, { method: "DELETE" });
      if (res.ok) {
        onRefresh();
      }
    } catch (err) {
      console.error("Disconnect error:", err);
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleSaveDriveFolder = async () => {
    if (!driveFolderId.trim()) return;
    setIsSavingFolder(true);
    setFolderSaveSuccess(false);

    // Extract folder ID if full Google Drive URL was pasted
    let cleanId = driveFolderId.trim();
    const match = cleanId.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      cleanId = match[1];
      setDriveFolderId(cleanId);
    }

    try {
      const res = await fetch("/api/drive/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderId: cleanId,
          folderName: driveFolderName.trim() || "5,000 Videos Folder",
        }),
      });
      if (res.ok) {
        setFolderSaveSuccess(true);
        setTimeout(() => setFolderSaveSuccess(false), 4000);
      }
    } catch (err) {
      console.error("Save folder error:", err);
    } finally {
      setIsSavingFolder(false);
    }
  };

  const renderStatusBadge = (status?: string) => {
    if (status === "connected") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Connected
        </span>
      );
    }
    if (status === "needs_reconnect") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5" />
          Needs Reconnect
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
        <XCircle className="w-3.5 h-3.5" />
        Not Connected
      </span>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 1. Google Drive Card (5,000 Videos Source) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
                <HardDrive className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Google Drive Storage</h3>
                <p className="text-xs text-slate-400">Source storage for your 5,000 videos</p>
              </div>
            </div>
            {renderStatusBadge(driveConn?.status)}
          </div>

          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Connect the Google account that contains your 5,000 videos. The cloud pipeline will automatically fetch and upload videos from this folder every morning.
          </p>

          {/* Drive Folder Selector / ID Setting */}
          {driveConn?.status === "connected" && (
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 mb-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <FolderCheck className="w-4 h-4 text-blue-400" />
                  Target 5,000 Videos Folder
                </span>
                {folderSaveSuccess && (
                  <span className="text-[11px] text-emerald-400 font-medium">Saved Successfully!</span>
                )}
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Paste Google Drive Folder URL or Folder ID..."
                  value={driveFolderId}
                  onChange={(e) => setDriveFolderId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveDriveFolder}
                    disabled={isSavingFolder || !driveFolderId.trim()}
                    className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {isSavingFolder ? "Saving..." : "Save 5,000 Videos Folder"}
                  </button>
                  <button
                    onClick={onOpenFolderPicker}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-all flex items-center gap-1"
                  >
                    Browse
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
          {driveConn?.status === "connected" ? (
            <>
              <button
                onClick={onOpenFolderPicker}
                className="px-3.5 py-2 bg-blue-600/90 hover:bg-blue-600 text-white rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 shadow-sm"
              >
                <HardDrive className="w-3.5 h-3.5" />
                Select Videos from Drive
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleConnect("drive")}
                  disabled={loadingProvider === "drive"}
                  title="Switch to another Google Drive Account"
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Switch Account
                </button>
                <button
                  onClick={() => handleDisconnect("drive", "Google Drive")}
                  disabled={loadingProvider === "drive"}
                  title="Disconnect Google Drive"
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <Unlink className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => handleConnect("drive")}
              disabled={loadingProvider === "drive"}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-900/20 disabled:opacity-50"
            >
              <HardDrive className="w-4 h-4" />
              {loadingProvider === "drive" ? "Connecting..." : "Connect Google Drive Account"}
            </button>
          )}
        </div>
      </div>

      {/* 2. YouTube Multi-Channel Hub (Connect 4-5 Channels) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500">
                <Youtube className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-white">YouTube Channels</h3>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
                    {youtubeConnections.length} Connected
                  </span>
                </div>
                <p className="text-xs text-slate-400">Multi-Channel Cloud Automation Hub</p>
              </div>
            </div>
            {renderStatusBadge(youtubeConnections.length > 0 ? "connected" : "disconnected")}
          </div>

          <p className="text-xs text-slate-400 mb-3 leading-relaxed">
            Connect all 4-5 of your YouTube channels. The automated pipeline will distribute and upload your Google Drive videos across each channel daily.
          </p>

          {/* Connected Channels List */}
          <div className="space-y-2 mb-4 max-h-56 overflow-y-auto pr-1">
            {youtubeConnections.length > 0 ? (
              youtubeConnections.map((ch, idx) => (
                <div
                  key={ch.id || idx}
                  className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3 flex items-center justify-between hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-red-600/20 text-red-500 border border-red-500/20 flex items-center justify-center shrink-0">
                      <Youtube className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-white truncate">
                          {ch.channelName || "YouTube Channel"}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Active
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 block truncate font-mono">
                        {ch.channelId || ch.provider}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {ch.channelId && (
                      <a
                        href={`https://youtube.com/channel/${ch.channelId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-1 text-[11px] text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-md transition-colors flex items-center gap-1"
                        title="Open Channel in YouTube"
                      >
                        View <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                    <button
                      onClick={() => handleDisconnect(ch.provider, ch.channelName || "Channel")}
                      disabled={loadingProvider === ch.provider}
                      title="Disconnect this channel"
                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-md transition-colors"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 bg-slate-950/40 border border-slate-800/60 rounded-xl text-center text-xs text-slate-500">
                No channels connected yet. Click below to connect your first channel.
              </div>
            )}
          </div>
        </div>

        {/* Action Button: Connect More Channel */}
        <div className="pt-3 border-t border-slate-800/80">
          <button
            onClick={() => handleConnect("youtube")}
            disabled={loadingProvider === "youtube"}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-md shadow-red-900/30 disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            {loadingProvider === "youtube"
              ? "Connecting YouTube Channel..."
              : youtubeConnections.length > 0
              ? "+ Connect Another YouTube Channel"
              : "Connect YouTube Account"}
          </button>
          <p className="text-[10px] text-slate-500 text-center mt-2">
            Each click prompts Google to choose any of your Google Accounts or Brand Channels.
          </p>
        </div>
      </div>
    </div>
  );
}
