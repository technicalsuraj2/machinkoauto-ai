"use client";

import React, { useState, useEffect } from "react";
import { Zap, Sparkles, ShieldCheck, ChevronRight, Scissors, ArrowRight } from "lucide-react";

interface PromoBannerProps {
  onOpenClipper: () => void;
  onOpenDrivePicker: () => void;
}

export default function PromoBanner({ onOpenClipper, onOpenDrivePicker }: PromoBannerProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      id: "clipper",
      badge: "AGNES AI ENGINE ENABLED",
      title: "Autonomous YouTube Shorts Clipper + High-CTR Thumbnails",
      description: "Extract high-energy moments from any YouTube video, burn karaoke captions, and auto-generate clickbait thumbnails using Agnes AI.",
      cta: "✂️ Launch Clipper Now",
      action: onOpenClipper,
      accent: "from-emerald-500 via-green-500 to-yellow-400",
      pill: "bg-emerald-950/80 border-emerald-500/40 text-emerald-300",
    },
    {
      id: "storage",
      badge: "ZERO-STORAGE GUARANTEE",
      title: "100% Zero Disk Waste — Auto-Cleanup Active",
      description: "Source downloads and local video files are automatically unlinked once rendered & published to YouTube. Your PC disk stays 100% clean.",
      cta: "⚡ Queue Drive Videos",
      action: onOpenDrivePicker,
      accent: "from-yellow-400 via-amber-500 to-emerald-400",
      pill: "bg-yellow-950/80 border-yellow-500/40 text-yellow-300",
    },
    {
      id: "automation",
      badge: "INSTANT STREAMING PIPELINE",
      title: "0-Minute Continuous Sequential Cloud Uploads",
      description: "Automate multiple Shorts uploads sequentially with zero delay gap. Full compliance with daily YouTube API quota limits.",
      cta: "✂️ Start New Batch",
      action: onOpenClipper,
      accent: "from-green-400 via-emerald-500 to-yellow-300",
      pill: "bg-emerald-950/80 border-emerald-500/40 text-emerald-300",
    },
  ];

  // Auto-cycle every 7 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const slide = slides[currentSlide];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-[#0c1214] via-[#090d10] to-[#12160d] p-6 shadow-[0_0_35px_rgba(16,185,129,0.12)]">
      {/* Decorative Cyber Background Glow */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/3 -mb-20 w-64 h-64 rounded-full bg-yellow-400/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2.5 max-w-2xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase tracking-wider border shadow-sm ${slide.pill}`}
            >
              ★ {slide.badge}
            </span>
            <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
              MachinkoAuto.Ai Studio Pro
            </span>
          </div>

          {/* Title */}
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            {slide.title}
          </h2>

          {/* Description */}
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
            {slide.description}
          </p>
        </div>

        {/* Right CTA & Slide Switcher */}
        <div className="flex flex-col items-start md:items-end gap-3 shrink-0">
          <button
            onClick={slide.action}
            className={`px-5 py-3 rounded-xl font-extrabold text-xs text-slate-950 bg-gradient-to-r ${slide.accent} hover:brightness-110 shadow-[0_0_25px_rgba(250,204,21,0.25)] flex items-center gap-2 transition-all transform hover:scale-[1.03]`}
          >
            <span>{slide.cta}</span>
            <ArrowRight className="w-4 h-4 text-slate-950" />
          </button>

          {/* Dots Indicator */}
          <div className="flex items-center gap-1.5 pt-1">
            {slides.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => setCurrentSlide(idx)}
                className={`h-1.5 rounded-full transition-all ${
                  currentSlide === idx
                    ? "w-7 bg-emerald-400 shadow-[0_0_8px_#10b981]"
                    : "w-2 bg-slate-800 hover:bg-slate-700"
                }`}
                title={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
