"use client";

import { Zone, SafeMargin } from "./lib_2/types";
import { classifyZone } from "./lib_2/BoundaryAnimationManager";

interface SideBarProps {
  isOpen: boolean;
  zones: Zone[];
  safeZones: SafeMargin[];
  activeZoneId: string | null;
  editMode: boolean;
  onSetZones: (zones: Zone[]) => void;
  onSetSafeZones: (safeZones: SafeMargin[]) => void;
  onSetActiveZoneId: (id: string | null) => void;
  onSetEditMode: (mode: boolean) => void;
  showDevTool?: boolean;
}

export default function SideBar({
  isOpen,
  zones,
  safeZones,
}: SideBarProps) {
  if (!isOpen) return null;

  const dangerZonesClassified = zones.filter((z) => classifyZone(z.name) === "danger");
  const safeZonesClassified = zones.filter((z) => classifyZone(z.name) === "safe");
  const otherZonesClassified = zones.filter((z) => classifyZone(z.name) === "other");
  const keepOutCount = dangerZonesClassified.length;
  const safeCount = safeZonesClassified.length + safeZones.length;
  const contextCount = otherZonesClassified.length;

  return (
    <aside className="flex h-full w-64 flex-shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            Operative Summary
          </p>
          <div className="mt-3 grid gap-2">
            <MetricRow label="Keep-out" value={keepOutCount} tone="text-rose-400" />
            <MetricRow label="Safe corridor" value={safeCount} tone="text-emerald-400" />
            <MetricRow label="Reference" value={contextCount} tone="text-zinc-300" />
          </div>
        </div>

        <div>
          <h3 className="py-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Procedure Timeline
          </h3>
          <div className="mt-2 space-y-3">
            <TimelineRow label="Next phase" name="Boundary review" meta="Expected in 18m" />
            <TimelineRow label="Current phase" name="Pericardial access" meta="10:15:12" active />
            <TimelineRow label="Previous phases" name="Port placement" meta="Ended 10:12:25" />
          </div>
        </div>

        <div>
          <h3 className="py-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Critical Keep-Out
          </h3>
          <div className="mt-2">
            <DangerZonesContent zones={dangerZonesClassified} />
          </div>
        </div>

        {(safeZonesClassified.length > 0 || safeZones.length > 0) && (
          <div>
            <h3 className="py-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Safe Corridor
            </h3>
            <div className="mt-2">
              <SafeZonesContent zones={safeZonesClassified} safeZones={safeZones} />
            </div>
          </div>
        )}

        {otherZonesClassified.length > 0 && (
          <div>
            <h3 className="py-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Reference Structures
            </h3>
            <div className="mt-2">
              <OtherZonesContent zones={otherZonesClassified} />
            </div>
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

function TimelineRow({
  label,
  name,
  meta,
  active = false,
}: {
  label: string;
  name: string;
  meta: string;
  active?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-zinc-400">{label}</p>
      <div className="mt-1 flex items-center justify-between">
        <p className={`text-sm ${active ? "text-emerald-400" : "text-zinc-300"}`}>{name}</p>
        <p className="mt-0.5 text-[11px] text-zinc-500">{meta}</p>
      </div>
    </div>
  );
}

function DangerZonesContent({ zones }: { zones: Zone[] }) {
  return (
    <div className="space-y-3">
      {zones.length === 0 ? (
        <p className="text-xs text-zinc-600">No danger zones found.</p>
      ) : (
        zones.map((zone) => (
          <div key={zone.id} className="flex items-center gap-3">
            <svg
              className="h-3 w-3 shrink-0 text-rose-600"
              viewBox="0 0 24 24"
              fill="currentColor"
              role="img"
            >
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
            </svg>
            <p className="text-sm text-white">{zone.name}</p>
          </div>
        ))
      )}
    </div>
  );
}

function OtherZonesContent({ zones }: { zones: Zone[] }) {
  return (
    <div className="space-y-3">
      {zones.map((zone) => (
        <div key={zone.id} className="flex items-center gap-3">
          <p className="text-sm text-white">{zone.name}</p>
        </div>
      ))}
    </div>
  );
}

function SafeZonesContent({
  zones,
  safeZones,
}: {
  zones: Zone[];
  safeZones: SafeMargin[];
}) {
  return (
    <div className="space-y-3">
      {zones.map((zone) => (
        <div key={zone.id} className="flex items-center gap-3">
          <svg
            className="h-3 w-3 shrink-0 text-emerald-500"
            viewBox="0 0 24 24"
            fill="currentColor"
            role="img"
          >
            <path d="M12 2L4 7v5c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V7l-8-5z" />
          </svg>
          <p className="text-sm text-white">{zone.name}</p>
        </div>
      ))}
      {safeZones.map((safeZone) => (
        <div key={safeZone.id} className="flex items-center gap-3">
          <span
            className="inline-block h-3 w-0.5 shrink-0 rounded-full"
            style={{ backgroundColor: safeZone.lineColor, opacity: safeZone.lineOpacity }}
          />
          <p className="text-sm text-white">{safeZone.name}</p>
        </div>
      ))}
    </div>
  );
}
