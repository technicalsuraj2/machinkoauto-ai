"use client";

import { useState, useEffect } from "react";
import { Terminal, RefreshCw, AlertCircle, Info, AlertTriangle, ShieldCheck } from "lucide-react";

export interface LogItem {
  id: string;
  level: "info" | "warn" | "error";
  message: string;
  createdAt: string;
}

interface LogsPanelProps {
  logs: LogItem[];
  onRefresh: () => void;
}

export default function LogsPanel({ logs, onRefresh }: LogsPanelProps) {
  const [filter, setFilter] = useState<"all" | "error" | "warn" | "info">("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const filteredLogs = logs.filter((log) => {
    if (filter === "all") return true;
    return log.level === filter;
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  };

  const renderIcon = (level: string) => {
    switch (level) {
      case "error":
        return <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />;
      case "warn":
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />;
      case "info":
      default:
        return <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />;
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg overflow-hidden flex flex-col">
      <div className="px-6 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">System Activity & Worker Logs</h3>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-[11px]">
            {(["all", "info", "warn", "error"] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilter(lvl)}
                className={`px-2 py-0.5 rounded capitalize font-medium transition-colors ${
                  filter === lvl
                    ? "bg-slate-800 text-white shadow-xs"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <button
            onClick={handleRefresh}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            title="Refresh logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="p-4 max-h-64 overflow-y-auto space-y-2 font-mono text-xs bg-slate-950/40">
        {filteredLogs.length === 0 ? (
          <p className="text-slate-500 text-center py-6">No logs recorded yet.</p>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-900/60 border border-slate-800/60"
            >
              {renderIcon(log.level)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[10px] uppercase font-bold tracking-wider ${
                      log.level === "error"
                        ? "text-red-400"
                        : log.level === "warn"
                        ? "text-amber-400"
                        : "text-blue-400"
                    }`}
                  >
                    {log.level}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-slate-300 mt-0.5 break-words font-sans text-xs">
                  {log.message}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
