"use client";

import { HardDrive, Youtube, CheckCircle2, AlertTriangle, XCircle, RefreshCw, ExternalLink, Unlink } from "lucide-react";
import { useState } from "react";

export interface ConnectionInfo {
  id: string;
  provider: "drive" | "youtube";
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

  const driveConn = connections.find((c) => c.provider === "drive");
  const youtubeConn = connections.find((c) => c.provider === "youtube");

  const handleConnect = (provider: "drive" | "youtube") => {
    setLoadingProvider(provider);
    window.location.href = `/api/connect/${provider}`;
  };

  const handleDisconnect = async (provider: "drive" | "youtube") => {
    if (!confirm(`Are you sure you want to disconnect ${provider === "drive" ? "Google Drive" : "YouTube"}?`)) {
      return;
    }
    setLoadingProvider(provider);
    try {
      const res = await fetch(`/api/connections/${provider}`, { method: "DELETE" });
      if (res.ok) {
        onRefresh();
      }
    } catch (err) {
      console.error("Disconnect error:", err);
    } finally {
      setLoadingProvider(null);
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Google Drive Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
                <HardDrive className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Google Drive</h3>
                <p className="text-xs text-slate-400">Source storage for video files</p>
              </div>
            </div>
            {renderStatusBadge(driveConn?.status)}
          </div>

          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Allows AutoTube to scan your folders for video files and save AI-generated videos using least-privilege OAuth scopes.
          </p>
        </div>

        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
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
                  title="Switch Google Drive Account"
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Switch Account
                </button>
                <button
                  onClick={() => handleDisconnect("drive")}
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
              {loadingProvider === "drive" ? "Connecting..." : "Connect Google Drive"}
            </button>
          )}
        </div>
      </div>

      {/* YouTube Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500">
                <Youtube className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">YouTube Channel</h3>
                <p className="text-xs text-slate-400">Target upload destination</p>
              </div>
            </div>
            {renderStatusBadge(youtubeConn?.status)}
          </div>

          <div className="mb-4">
            {youtubeConn?.channelName ? (
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 block uppercase font-medium">Channel</span>
                  <span className="text-sm font-medium text-white">{youtubeConn.channelName}</span>
                </div>
                {youtubeConn.channelId && (
                  <a
                    href={`https://youtube.com/channel/${youtubeConn.channelId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-red-400 hover:underline flex items-center gap-1"
                  >
                    View <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 leading-relaxed">
                Connect your YouTube channel to enable automatic chunked resumable video uploads directly from Google Drive.
              </p>
            )}
          </div>
        </div>

        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
          {youtubeConn?.status === "connected" ? (
            <>
              <button
                onClick={() => handleConnect("youtube")}
                disabled={loadingProvider === "youtube"}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Switch Channel
              </button>
              <button
                onClick={() => handleDisconnect("youtube")}
                disabled={loadingProvider === "youtube"}
                title="Disconnect YouTube"
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <Unlink className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => handleConnect("youtube")}
              disabled={loadingProvider === "youtube"}
              className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-md shadow-red-900/20 disabled:opacity-50"
            >
              <Youtube className="w-4 h-4" />
              {loadingProvider === "youtube" ? "Connecting..." : "Connect YouTube Account"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
