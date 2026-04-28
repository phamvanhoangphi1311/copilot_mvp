"use client";

import { useRef, useState, useEffect } from "react";
import type { FeatureConfig, FeatureId } from "@/lib/features";

export type AppTab = "gallery" | "video";

interface TaskBarProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  features: FeatureConfig[];
  selectedFeature: FeatureId;
  onFeatureChange: (featureId: FeatureId) => void;
}

const TABS: { id: AppTab; label: string }[] = [
  { id: "video", label: "Hazard Awareness" },
  { id: "gallery", label: "Dataset Preview" },
];

export default function TaskBar({
  activeTab,
  onTabChange,
  features,
  selectedFeature,
  onFeatureChange,
}: TaskBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [featureMenuOpen, setFeatureMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const featureMenuRef = useRef<HTMLDivElement>(null);
  const activeFeature = features.find((feature) => feature.id === selectedFeature);
  const enabledCount = features.filter((feature) => feature.enabled).length;

  useEffect(() => {
    if (!menuOpen && !featureMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (featureMenuRef.current && !featureMenuRef.current.contains(e.target as Node)) {
        setFeatureMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [featureMenuOpen, menuOpen]);

  return (
    <header className="relative z-[60] border-b border-white/[0.06] bg-[linear-gradient(180deg,rgba(6,15,24,0.98),rgba(5,11,18,0.95))] backdrop-blur-xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_left,rgba(0,212,255,0.12),transparent_26%),radial-gradient(circle_at_right,rgba(56,189,248,0.08),transparent_24%)]" />
      <div className="relative flex min-h-16 items-center justify-between gap-4 px-5 py-2.5">
      <div className="flex min-w-0 items-center gap-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 shadow-[0_0_30px_rgba(0,212,255,0.12)]">
            <span className="text-base font-semibold text-cyan-200">CV</span>
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-zinc-100">
              CARDIOVIS
            </div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              Procedure Focus
            </p>
            <p className="truncate text-xs text-zinc-300">
              {activeFeature?.summary ?? "Feature-specific surgical guidance"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Feature
            </p>
            <div className="relative mt-1" ref={featureMenuRef}>
              <button
                id="feature-selector"
                type="button"
                onClick={() => setFeatureMenuOpen((value) => !value)}
                className={`flex min-w-[172px] items-center justify-between rounded-xl border px-3 py-1.5 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition-colors ${
                  featureMenuOpen
                    ? "border-cyan-400/40 bg-[#10202c] text-white"
                    : "border-white/[0.08] bg-[#0a131c] text-zinc-100 hover:border-cyan-400/30 hover:bg-[#0d1822]"
                }`}
              >
                <span>{activeFeature?.label ?? selectedFeature}</span>
                <svg className={`h-4 w-4 text-zinc-500 transition-transform ${featureMenuOpen ? "rotate-180 text-cyan-300" : ""}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M5 7.5 10 12.5 15 7.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {featureMenuOpen && (
                <div className="absolute left-0 top-[calc(100%+8px)] z-[90] min-w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#09131d]/98 p-1.5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                  {features.map((feature) => {
                    const isSelected = feature.id === selectedFeature;
                    return (
                      <button
                        key={feature.id}
                        type="button"
                        disabled={!feature.enabled}
                        onClick={() => {
                          if (!feature.enabled) return;
                          onFeatureChange(feature.id);
                          setFeatureMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                          !feature.enabled
                            ? "cursor-not-allowed text-zinc-600"
                            : isSelected
                              ? "bg-cyan-400/12 text-cyan-200"
                              : "text-zinc-200 hover:bg-[#132838] hover:text-white"
                        }`}
                      >
                        <span>{feature.label}{!feature.enabled ? " (Coming soon)" : ""}</span>
                        {isSelected && feature.enabled ? (
                          <span className="text-[10px] uppercase tracking-[0.18em] text-cyan-300">live</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="hidden lg:block">
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Availability
            </p>
            <p className="mt-1 text-sm text-zinc-300">
              {enabledCount}/{features.length} procedure modes ready
            </p>
            {!activeFeature?.enabled && activeFeature?.disabledReason && (
              <p className="mt-1 text-xs text-amber-400">{activeFeature.disabledReason}</p>
            )}
          </div>
        </div>
        <nav className="flex items-center gap-1 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab.id
                  ? "bg-white/[0.10] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05]"
                }`}
            >
              {tab.label}
            </button>
            ))}
        </nav>
      </div>

      {/* Right section: settings icon with dropdown */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="hidden lg:flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-[10px] text-zinc-400">
          <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.55)]" />
          surgical console online
        </div>

      <div className="relative z-[70] flex items-center" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          title="Settings"
          className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors ${menuOpen ? "border-white/[0.12] bg-white/[0.08] text-zinc-100" : "border-white/[0.08] bg-white/[0.035] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
            }`}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317a1.724 1.724 0 013.35 0 1.724 1.724 0 002.573 1.066 1.724 1.724 0 012.372 2.372 1.724 1.724 0 001.066 2.573 1.724 1.724 0 010 3.35 1.724 1.724 0 00-1.066 2.573 1.724 1.724 0 01-2.372 2.372 1.724 1.724 0 00-2.573 1.066 1.724 1.724 0 01-3.35 0 1.724 1.724 0 00-2.573-1.066 1.724 1.724 0 01-2.372-2.372 1.724 1.724 0 00-1.066-2.573 1.724 1.724 0 010-3.35 1.724 1.724 0 001.066-2.573 1.724 1.724 0 012.372-2.372 1.724 1.724 0 002.573-1.066z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-12 z-[80] min-w-48 rounded-2xl border border-white/[0.08] bg-[#091019]/96 py-2 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <button
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/[0.05]"
            >
              <span className="text-red-400">●</span>
              Capture
            </button>
          </div>
        )}
      </div>
      </div>
      </div>
    </header>
  );
}
