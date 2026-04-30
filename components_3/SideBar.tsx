"use client";

import { useMemo } from "react";
import { Zone } from "@/lib/types";
import { ROLE_COLORS, getDisplayName, getRole } from "@/components_3/overlayConfig";

interface SideBarProps {
  isOpen: boolean;
  zones: Zone[];
  legendHidden: boolean;
  hoveredZoneName?: string | null;
  pinnedZoneName?: string | null;
  onLegendToggle: () => void;
  onZoneHover: (zoneName: string | null) => void;
  onZonePin: (zoneName: string) => void;
}

const ROLE_LABELS: Record<string, string> = {
  target: "Target",
  avoid: "Keep-out",
  caution: "Caution",
  tool: "Tools",
};

const ROLE_ORDER = ["target", "avoid", "caution", "tool"] as const;

export default function SideBar({
  isOpen,
  zones,
  legendHidden,
  hoveredZoneName,
  pinnedZoneName,
  onLegendToggle,
  onZoneHover,
  onZonePin,
}: SideBarProps) {
  if (!isOpen) return null;

  const grouped = useMemo(() => {
    const groups: Record<string, Zone[]> = { target: [], avoid: [], caution: [], tool: [] };
    for (const zone of zones) {
      const role = getRole(zone.name);
      if (groups[role]) groups[role].push(zone);
    }
    return groups;
  }, [zones]);

  const targetCount = grouped.target.length;
  const keepOutCount = grouped.avoid.length;
  const cautionCount = grouped.caution.length;

  return (
    <aside className="flex h-full w-64 flex-shrink-0 flex-col border-r border-white/[0.06] bg-zinc-950">
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
              Operative Summary
            </p>
            <button
              onClick={onLegendToggle}
              className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
            >
              {legendHidden ? "Show" : "Hide"}
            </button>
          </div>
          <div className="mt-3 grid gap-2">
            <MetricRow label="Target" value={targetCount} tone="text-emerald-400" />
            <MetricRow label="Keep-out" value={keepOutCount} tone="text-rose-400" />
            <MetricRow label="Caution" value={cautionCount} tone="text-amber-300" />
          </div>
        </div>

        {!legendHidden && (
          <div className="space-y-4">
            {ROLE_ORDER.map((role) => {
              const items = grouped[role];
              if (!items.length) return null;
              const color = ROLE_COLORS[role];

              return (
                <div key={role}>
                  <h3 className="flex items-center gap-2 py-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
                    <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                    {ROLE_LABELS[role]}
                  </h3>
                  <div className="mt-2 space-y-2">
                    {items.map((zone) => {
                      const isPinned = pinnedZoneName === zone.name;
                      const isHovered = hoveredZoneName === zone.name;
                      return (
                        <button
                          key={zone.id}
                          onMouseEnter={() => onZoneHover(zone.name)}
                          onMouseLeave={() => onZoneHover(null)}
                          onClick={() => onZonePin(zone.name)}
                          className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                            isPinned || isHovered
                              ? "border-white/[0.14] bg-white/[0.07] text-white"
                              : "border-zinc-800 bg-zinc-950/80 text-zinc-300 hover:bg-zinc-900"
                          }`}
                        >
                          <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />
                          <span className="text-sm">{getDisplayName(zone.name)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

function MetricRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2">
      <span className="text-xs text-zinc-400">{label}</span>
      <span className={`text-sm font-semibold ${tone}`}>{value}</span>
    </div>
  );
}
