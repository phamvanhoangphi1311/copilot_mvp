"use client";

import { useEffect, useRef, useState } from "react";

export type AppTab = "gallery" | "video";

interface TaskBarProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

const TABS: { id: AppTab; label: string; subtitle: string }[] = [
  { id: "video", label: "Procedure View", subtitle: "Live guidance" },
  { id: "gallery", label: "Frame Review", subtitle: "Dataset browser" },
];

function LiveVitals() {
  const [hr, setHr] = useState(72);
  const [spo2, setSpo2] = useState(99);

  useEffect(() => {
    const t = setInterval(() => {
      setHr((p) => Math.max(58, Math.min(95, p + Math.round((Math.random() - 0.5) * 3))));
      setSpo2((p) => Math.max(96, Math.min(100, p + Math.round((Math.random() - 0.5) * 1))));
    }, 1500);
    return () => clearInterval(t);
  }, []);

  const mono = "font-[family-name:var(--font-jetbrains)]";

  return (
    <div className="hidden xl:flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-1.5">
      {[
        { label: "HR", value: hr, suffix: "", tone: "text-emerald-300" },
        { label: "SpO₂", value: spo2, suffix: "%", tone: "text-cyan-300" },
        { label: "BP", value: "118/76", suffix: "", tone: "text-violet-300" },
      ].map((item, index) => (
        <div key={item.label} className="flex items-center gap-2">
          {index > 0 && <div className="h-5 w-px bg-white/[0.08]" />}
          <span className={`text-[9px] uppercase tracking-[0.18em] text-zinc-500 ${mono}`}>{item.label}</span>
          <span className={`text-xs font-semibold tabular-nums ${item.tone} ${mono}`}>{item.value}{item.suffix}</span>
          {item.label === "HR" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />}
        </div>
      ))}
    </div>
  );
}

export default function TaskBar({ activeTab, onTabChange }: TaskBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const mono = "font-[family-name:var(--font-jetbrains)]";

  return (
    <header className="relative border-b border-white/[0.06] bg-[#07111a]/88 backdrop-blur-xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_left,rgba(67,199,255,0.12),transparent_28%),radial-gradient(circle_at_right,rgba(178,133,255,0.08),transparent_24%)]" />
      <div className="relative flex h-16 items-center justify-between gap-4 px-5">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 shadow-[0_0_30px_rgba(67,199,255,0.18)]">
              <svg className="h-5 w-5 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M4 12h16" />
                <circle cx="12" cy="12" r="7.5" opacity="0.6" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className={`text-[11px] uppercase tracking-[0.26em] text-cyan-200/80 ${mono}`}>CardioVis Suite</div>
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="truncate text-sm font-semibold text-white">Cardiac Procedure Copilot</h1>
                <span className={`hidden sm:inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-emerald-300 ${mono}`}>
                  sterile ui
                </span>
              </div>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] p-1">
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`rounded-full px-4 py-2 text-left transition-all ${active ? "bg-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" : "hover:bg-white/[0.05]"}`}
                >
                  <div className={`text-[11px] font-semibold ${active ? "text-white" : "text-zinc-400"}`}>{tab.label}</div>
                  <div className={`text-[10px] ${mono} ${active ? "text-cyan-200/80" : "text-zinc-600"}`}>{tab.subtitle}</div>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <LiveVitals />

          <div className={`hidden md:flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[10px] text-zinc-400 ${mono}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(67,199,255,0.55)]" />
            1920×1080 surgical feed
          </div>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition-all ${menuOpen ? "border-white/[0.18] bg-white/[0.08] text-white" : "border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06] hover:text-white"}`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM12 12.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM12 18.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-12 z-50 min-w-52 rounded-2xl border border-white/[0.08] bg-[#091019]/96 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                <button
                  onClick={() => setMenuOpen(false)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/[0.05] ${mono}`}
                >
                  <span>Capture snapshot</span>
                  <span className="text-[10px] text-zinc-500">⌘S</span>
                </button>
                <button
                  onClick={() => setMenuOpen(false)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/[0.05] ${mono}`}
                >
                  <span>Minimal overlays</span>
                  <span className="text-[10px] text-zinc-500">UI</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
