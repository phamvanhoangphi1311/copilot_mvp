"use client";

import { useMemo } from "react";
import { Zone } from "@/lib/types";
import { ROLE_COLORS, getRole } from "@/components_3/overlayConfig";

interface SideBarProps {
  isOpen: boolean;
  zones: Zone[];
  legendHidden: boolean;
  focusMode: boolean;
  hoveredZoneName?: string | null;
  pinnedZoneName?: string | null;
  onLegendToggle: () => void;
  onZoneHover: (zoneName: string | null) => void;
  onZonePin: (zoneName: string) => void;
  procedureGuidance: {
    objective: string;
    primaryAvoid: string;
    nextAction: string;
  };
}

const ROLE_LABELS: Record<string, { label: string; icon: string }> = {
  target:  { label: "TARGET",  icon: "◎" },
  avoid:   { label: "AVOID",   icon: "⚠" },
  caution: { label: "CAUTION", icon: "◈" },
  tool:    { label: "TOOL",    icon: "◇" },
};

function ConfBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 text-right text-[10px] font-medium text-zinc-600 font-[family-name:var(--font-jetbrains)]">{label}</span>
      <div className="conf-bar-track flex-1">
        <div className="conf-bar-fill" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="w-8 text-[10px] tabular-nums text-zinc-500 font-[family-name:var(--font-jetbrains)]">{value}%</span>
    </div>
  );
}

export default function SideBar({
  isOpen,
  zones,
  legendHidden,
  focusMode,
  hoveredZoneName,
  pinnedZoneName,
  onLegendToggle,
  onZoneHover,
  onZonePin,
  procedureGuidance,
}: SideBarProps) {
  if (!isOpen) return null;

  const jb = "font-[family-name:var(--font-jetbrains)]";

  // Group zones by role
  const grouped = useMemo(() => {
    const groups: Record<string, Zone[]> = { target: [], avoid: [], caution: [], tool: [] };
    for (const z of zones) {
      const role = getRole(z.name);
      if (groups[role]) groups[role].push(z);
    }
    return groups;
  }, [zones]);

  const hasInstruments = grouped.tool.length > 0;
  const hasNeedle = grouped.tool.some(z => z.name === "Needle holders");
  const hasGrasper = grouped.tool.some(z => z.name === "Grasper");
  const visibleRoles = ["target", "avoid", "caution"] as const;
  const criticalCount = grouped.avoid.length + grouped.caution.length;
  const targetCount = grouped.target.length;
  const pinnedReviewZone = pinnedZoneName;

  return (
    <aside className="flex h-full w-[258px] flex-shrink-0 flex-col border-r border-white/[0.06] bg-[linear-gradient(180deg,rgba(6,15,24,0.97),rgba(5,11,18,0.95))] backdrop-blur-xl">
      <div className="border-b border-white/[0.06] px-4 py-3.5">
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500 ${jb}`}>
              Surgical Console
            </p>
            <p className={`mt-1 text-[13px] text-zinc-300 ${jb}`}>
              Structure awareness and assistive guidance
            </p>
          </div>
          <button
            onClick={onLegendToggle}
            className={`rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white ${jb}`}
          >
            {legendHidden ? "Show Legend" : "Hide Legend"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-cyan-400/10 bg-cyan-400/[0.06] px-3 py-2.5 shadow-[0_12px_30px_rgba(0,212,255,0.06)]">
            <p className={`text-[10px] uppercase tracking-[0.18em] text-cyan-200/70 ${jb}`}>Target</p>
            <p className={`mt-1 text-lg font-semibold text-cyan-200 ${jb}`}>{targetCount}</p>
            <p className={`mt-1 text-[10px] text-zinc-500 ${jb}`}>focus structure tracked</p>
          </div>
          <div className="rounded-2xl border border-rose-400/10 bg-rose-400/[0.06] px-3 py-2.5 shadow-[0_12px_30px_rgba(255,50,180,0.06)]">
            <p className={`text-[10px] uppercase tracking-[0.18em] text-rose-200/70 ${jb}`}>Critical</p>
            <p className={`mt-1 text-lg font-semibold text-rose-200 ${jb}`}>{criticalCount}</p>
            <p className={`mt-1 text-[10px] text-zinc-500 ${jb}`}>keep-out cues active</p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-3 shadow-[0_18px_36px_rgba(0,0,0,0.2)]">
          <div>
            <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 ${jb}`}>
              Phase State
            </p>
            <p className={`mt-1 text-[15px] font-semibold ${hasNeedle ? "text-cyan-300" : hasGrasper ? "text-emerald-300" : "text-zinc-300"} ${jb}`}>
              {hasNeedle ? "Suturing Window" : hasGrasper ? "Retraction Assist" : "Observation Mode"}
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] ${
            hasNeedle
              ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-200"
              : hasGrasper
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                : "border-white/[0.08] bg-white/[0.04] text-zinc-400"
          } ${jb}`}>
            <span className={`h-2 w-2 rounded-full ${hasNeedle ? "bg-cyan-300" : hasGrasper ? "bg-emerald-300" : "bg-zinc-500"}`} />
            live
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-3 py-3">
          <div className="flex items-center justify-between">
            <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 ${jb}`}>
              Procedure Guidance
            </p>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] ${
              focusMode
                ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-200"
                : "border-white/[0.08] bg-white/[0.03] text-zinc-500"
            } ${jb}`}>
              {focusMode ? "focus mode" : "standard"}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            <div>
              <p className={`text-[10px] uppercase tracking-[0.16em] text-zinc-600 ${jb}`}>Current objective</p>
              <p className={`mt-1 text-[12px] text-zinc-200 ${jb}`}>{procedureGuidance.objective}</p>
            </div>
            <div>
              <p className={`text-[10px] uppercase tracking-[0.16em] text-zinc-600 ${jb}`}>Primary avoid</p>
              <p className={`mt-1 text-[12px] text-rose-200 ${jb}`}>{procedureGuidance.primaryAvoid}</p>
            </div>
            <div>
              <p className={`text-[10px] uppercase tracking-[0.16em] text-zinc-600 ${jb}`}>Next safe action</p>
              <p className={`mt-1 text-[12px] text-zinc-200 ${jb}`}>{procedureGuidance.nextAction}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 ${jb}`}>
            Review
          </p>
          <span className={`rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] text-zinc-500 ${jb}`}>interactive</span>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.18)]">
          <div className={`text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 ${jb}`}>Status</div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${hasNeedle ? "bg-[#00E5FF] shadow-[0_0_8px_rgba(0,229,255,0.5)]" : hasGrasper ? "bg-[#00FF88] shadow-[0_0_8px_rgba(0,255,136,0.4)]" : "bg-zinc-600"}`} />
            <span className={`text-[16px] font-medium ${hasNeedle ? "text-[#00E5FF]" : hasGrasper ? "text-[#00FF88]" : "text-zinc-300"} ${jb}`}>
              {hasNeedle ? "Suturing" : hasGrasper ? "Retraction" : "Observing"}
            </span>
          </div>
          {hasInstruments && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {grouped.tool.map(z => (
                <span key={z.id} className={`inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-[10px] text-zinc-400 ${jb}`}>
                  {z.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="h-[96px] rounded-2xl border border-white/[0.10] bg-white/[0.05] px-3 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.14)]">
            <div className="flex items-center justify-between">
              <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 ${jb}`}>Pinned Review</p>
              <span className={`rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] text-zinc-400 ${jb}`}>
                {pinnedReviewZone ? "pinned" : "idle"}
              </span>
            </div>
            <p className={`mt-2 text-[13px] text-white ${jb}`}>
              {pinnedReviewZone ?? "No structure selected"}
            </p>
            <p className={`mt-2 text-[11px] text-zinc-400 ${jb}`}>
              {pinnedReviewZone
                ? "Other structures are visually de-emphasized for focused review."
                : "Hover previews only affect the video. Click a structure to lock review here."}
            </p>
          </div>

        {!legendHidden && (
          <>
        {visibleRoles.map(role => {
          const items = grouped[role];
          if (!items || items.length === 0) return null;
          const roleInfo = ROLE_LABELS[role];
          const roleColor = ROLE_COLORS[role];

          return (
            <div key={role} className="animate-fade-up">
              <div className={`flex items-center gap-1.5 mb-2 ${jb}`}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: roleColor, boxShadow: `0 0 6px ${roleColor}66` }} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  {roleInfo.label}
                </span>
              </div>
              <div className="space-y-1">
                {items.map(z => {
                  const color = roleColor;
                  const isPinned = pinnedZoneName === z.name;
                  return (
                    <button
                      key={z.id}
                      onMouseEnter={() => onZoneHover(z.name)}
                      onMouseLeave={() => onZoneHover(null)}
                      onClick={() => onZonePin(z.name)}
                      className={`w-full rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                        isPinned
                          ? "border-white/[0.14] bg-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
                          : "border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04]"
                      }`}
                      >
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: color, boxShadow: `0 0 4px ${color}44` }} />
                        <span className={`text-[13px] ${isPinned ? "text-white" : "text-zinc-300"} ${jb}`}>{z.name}</span>
                        <span
                          className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] ${jb} ${
                            isPinned
                              ? "border-white/[0.08] bg-white/[0.06] text-zinc-300"
                              : "border-transparent bg-transparent text-transparent"
                          }`}
                        >
                          active
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
          </>
        )}

      </div>
    </aside>
  );
}
