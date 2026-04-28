import { Zone } from "@/lib/types";
import { classifyZone } from "@/lib/ZoneFactory";

interface SideBarProps {
  isOpen: boolean;
  zones: Zone[];
}

export default function SideBar({ isOpen, zones }: SideBarProps) {
  if (!isOpen) return null;

  const dangerZonesClassified = zones.filter((z) => classifyZone(z.name) === "danger");
  const safeZonesClassified = zones.filter((z) => classifyZone(z.name) === "safe");
  const otherZonesClassified = zones.filter((z) => classifyZone(z.name) === "other");
  const keepOutCount = dangerZonesClassified.length;
  const safeCount = safeZonesClassified.length;
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
            <div>
              <p className="text-xs text-zinc-400">Next phase</p>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-sm text-zinc-300">Leaflet Coaptation</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">Expected in 18m</p>
              </div>
            </div>

            <div>
              <p className="text-xs text-zinc-400">Current phase</p>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-sm text-emerald-400">Annuloplasty</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">10:15:12</p>
              </div>
            </div>

            <div>
              <p className="text-xs text-zinc-400">Previous phases</p>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-sm text-white">Leaflet Repair</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">Ended 10:12:25</p>
              </div>
            </div>
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
        {safeZonesClassified.length > 0 && (
          <div>
            <h3 className="py-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Safe Corridor
            </h3>
            <div className="mt-2">
              <SafeZonesContent zones={safeZonesClassified} />
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

function SafeZonesContent({ zones }: { zones: Zone[] }) {
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
    </div>
  );
}
