"use client";

import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, ExternalLink, ShieldAlert } from "lucide-react";

export default function QuotaNotice() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden text-xs">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-2 text-amber-400 font-medium">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>Important YouTube API Quota & Verification Notice (10,000 units/day limit)</span>
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <span>{isOpen ? "Hide details" : "Learn more"}</span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {isOpen && (
        <div className="p-4 pt-2 border-t border-slate-800/80 space-y-3 bg-slate-950/40 text-slate-300">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
              <span className="font-semibold text-white block mb-1">1. Quota Budget</span>
              <p className="text-slate-400">
                Default quota is <strong>10,000 units/day</strong>. Each video upload takes ~1,600 units, allowing <strong>~6 uploads per day</strong>. Resets daily at midnight Pacific Time (PT).
              </p>
            </div>
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
              <span className="font-semibold text-white block mb-1">2. Unverified Project Lock</span>
              <p className="text-slate-400">
                Google Cloud projects that haven't completed the YouTube API compliance audit will automatically lock uploaded videos to <strong>Private</strong>. Submit audit for public visibility.
              </p>
            </div>
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
              <span className="font-semibold text-white block mb-1">3. Testing Mode (7-Day Tokens)</span>
              <p className="text-slate-400">
                When OAuth Consent Screen is in <strong>Testing</strong> status, refresh tokens expire in 7 days and only added <strong>Test Users</strong> can log in.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 pt-1 text-[11px] text-slate-400">
            <a
              href="https://developers.google.com/youtube/v3/getting-started#quota"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-indigo-400 hover:underline"
            >
              YouTube Quota Calculator <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="https://support.google.com/youtube/contact/yt_api_form"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-indigo-400 hover:underline"
            >
              Request Quota Increase <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="https://console.cloud.google.com/apis/credentials/consent"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-indigo-400 hover:underline"
            >
              OAuth Consent Screen Settings <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
