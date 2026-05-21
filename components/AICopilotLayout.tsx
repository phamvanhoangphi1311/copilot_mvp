"use client";

import { useMemo, useState } from "react";
import type { AppTab } from "@/components/TaskBar";
import ImageGalleryTab from "@/components/ImageGalleryTab";
import Feature2Tab from "@/components/Feature2Tab";
import Feature3VideoTab from "@/components/Feature3VideoTab";
import VideoPlayerTab from "@/components/VideoPlayerTab";
import type { BoundaryRecord } from "@/lib/boundaryOverlay";
import type { FeatureConfig, FeatureId } from "@/lib/features";
import type { SegmentationTag } from "@/lib/segmentationOverlay";

// ─── Types ────────────────────────────────────────────────────────────────────

type GuidanceMode = "voice" | "text" | "both";
type RiskSensitivity = "standard" | "high";
type TargetIconStyle = "reticle" | "crosshair" | "pulse";
type TargetAssistOption =
  | "target-lock"
  | "confidence-halo"
  | "approach-vector"
  | "distance-cue"
  | "label-anchor"
  | "low-light-boost";

interface NamedZone {
  id: string;
  name: string;
  color: string;
}

interface PhaseConfig {
  guidanceMode: GuidanceMode;
  showOverlay: boolean;
  showFullLabels: boolean;
  showToolZones: boolean;
  riskSensitivity: RiskSensitivity;
  overlayColors: NamedZone[];
  targetIconStyle: TargetIconStyle;
  targetAssistOptions: TargetAssistOption[];
}

interface PhaseItem {
  id: string;
  name: string;
  presetId: string;
  config: PhaseConfig;
  isCustom: boolean;
}

// ─── Props interface ──────────────────────────────────────────────────────────

interface AICopilotLayoutProps {
  features: FeatureConfig[];
  initialMasks: Array<{ image: string; tags: SegmentationTag[] }>;
  initialPoints: BoundaryRecord[];
}

// ─── Cyberpunk Medical Design System ──────────────────────────────────────────

const C = {
  bg: "#020817",          // Deep space black
  bg2: "#040d1a",         // Slightly lighter panel bg
  bg3: "#071428",         // Card bg
  gridLine: "#0f2744",    // Grid lines
  cyan: "#00e5ff",        // Primary neon cyan
  cyanDim: "#0091a8",     // Dimmer cyan
  magenta: "#ff2d78",     // Neon pink / danger
  lime: "#a3ff12",        // Neon lime / target
  amber: "#ffb700",       // Neon amber / avoid
  purple: "#b44fff",      // Neon purple / accent
  text: "#e2e8f0",        // Primary text
  textDim: "#64748b",     // Dimmed text
  textDarker: "#334155",  // Darker text
  border: "#1e3a5f",      // Border color
  borderBright: "#2563eb", // Bright border
  danger: "#ff1744",       // Neon red danger
};

const DEFAULT_PHASE_CONFIG: PhaseConfig = {
  guidanceMode: "both",
  showOverlay: true,
  showFullLabels: false,
  showToolZones: false,
  riskSensitivity: "standard",
  overlayColors: [
    { id: "z1", name: "Target", color: C.lime },
    { id: "z2", name: "Avoid", color: C.amber },
    { id: "z3", name: "Danger", color: C.magenta },
  ],
  targetIconStyle: "reticle",
  targetAssistOptions: ["target-lock", "confidence-halo", "label-anchor"],
};

// ─── Presets ──────────────────────────────────────────────────────────────────

const PRESETS: Record<string, { label: string; config: PhaseConfig }> = {
  surgical: {
    label: "Surgical",
    config: {
      ...DEFAULT_PHASE_CONFIG,
      overlayColors: [
        { id: "z1", name: "Target", color: C.lime },
        { id: "z2", name: "Avoid", color: C.amber },
        { id: "z3", name: "Danger", color: C.magenta },
      ],
    },
  },
  highContrast: {
    label: "High Contrast",
    config: {
      ...DEFAULT_PHASE_CONFIG,
      overlayColors: [
        { id: "z1", name: "Target", color: "#00bfff" },
        { id: "z2", name: "Avoid", color: "#ffea00" },
        { id: "z3", name: "Danger", color: "#ff1744" },
      ],
      targetIconStyle: "crosshair",
    },
  },
  nightOps: {
    label: "Night Ops",
    config: {
      ...DEFAULT_PHASE_CONFIG,
      overlayColors: [
        { id: "z1", name: "Target", color: "#39ff14" },
        { id: "z2", name: "Avoid", color: "#ff6600" },
        { id: "z3", name: "Danger", color: "#ff0044" },
      ],
      targetIconStyle: "pulse",
    },
  },
  teaching: {
    label: "Teaching",
    config: {
      ...DEFAULT_PHASE_CONFIG,
      guidanceMode: "text",
      showFullLabels: true,
      overlayColors: [
        { id: "z1", name: "Target", color: "#00e5ff" },
        { id: "z2", name: "Avoid", color: "#ffb700" },
        { id: "z3", name: "Danger", color: "#ff4081" },
      ],
      targetAssistOptions: ["target-lock", "confidence-halo", "label-anchor", "approach-vector", "distance-cue"],
      targetIconStyle: "pulse",
    },
  },
};

const PRESET_KEYS = Object.keys(PRESETS);

const GUIDANCE_OPTIONS: Array<{ id: GuidanceMode; label: string; copy: string }> = [
  { id: "voice", label: "Voice", copy: "Audio alerts only — no on-screen text." },
  { id: "both", label: "Voice + Text", copy: "Short voice prompts + compact transcript." },
  { id: "text", label: "Text only", copy: "Silent guidance for review or demos." },
];

const TARGET_ICON_OPTIONS: Array<{ id: TargetIconStyle; label: string; copy: string }> = [
  { id: "reticle", label: "Reticle", copy: "Best for precise targeting." },
  { id: "crosshair", label: "Crosshair", copy: "Sharper, minimal marker." },
  { id: "pulse", label: "Pulse", copy: "High-salience for teaching." },
];

const TARGET_ASSIST_OPTIONS: Array<{ id: TargetAssistOption; label: string; copy: string }> = [
  { id: "target-lock", label: "Lock", copy: "Keep marker fixed." },
  { id: "confidence-halo", label: "Halo", copy: "Show confidence." },
  { id: "approach-vector", label: "Vector", copy: "Approach direction." },
  { id: "distance-cue", label: "Distance", copy: "Spacing cue." },
  { id: "label-anchor", label: "Anchor", copy: "Pin label nearby." },
  { id: "low-light-boost", label: "Boost", copy: "Dark-field boost." },
];

// ─── Semantic color mapping ────────────────────────────────────────────────────
// Keywords are matched case-insensitively. First match wins.

const ZONE_SEMANTIC_MAP: Array<{ keywords: string[]; color: string; label: string }> = [
  // Danger / critical
  { keywords: ["danger", "critical", "hazard", "risk", "caution", "warning", "nerve", "phrenic"], color: C.magenta, label: "Danger" },
  { keywords: ["danger", "critical", "hazard", "risk", "warning", "nerve", "right atrium", "right vent"], color: "#ff2d78", label: "Critical" },
  // Avoid / caution
  { keywords: ["avoid", "caution", "adjacent", "proximity", "fat", "epicardial", "fat pad"], color: C.amber, label: "Avoid" },
  { keywords: ["atrium", "ventricle", "auricle", "pericardium", "fat", "esophagus"], color: "#ffb700", label: "Caution" },
  // Target / anatomy
  { keywords: ["target", "aim", "landmark", "root", "annulus", "commissure", "leaflet", "aortic root", "mitral", "tricuspid"], color: C.lime, label: "Target" },
  { keywords: ["aortic", "root", "annulus", "mv", "tv", "av"], color: "#00e5ff", label: "Valve" },
  // Tool / instrument
  { keywords: ["tool", "grasper", "needle", "scissor", "instrument", "cannula", "trocars"], color: "#b44fff", label: "Tool" },
  // Safe / structure
  { keywords: ["safe", "structure", "landscape", "reference", "landmarks"], color: "#34d399", label: "Safe" },
];

function getSemanticColor(zoneName: string): { color: string; suggestedLabel: string } {
  const lower = zoneName.toLowerCase().trim();
  for (const entry of ZONE_SEMANTIC_MAP) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) {
        return { color: entry.color, suggestedLabel: entry.label };
      }
    }
  }
  return { color: C.lime, suggestedLabel: "Zone" };
}

const ZONE_PALETTE = [
  C.lime, "#00e5ff", "#39ff14", "#76ff03", "#00bfa5",
  C.amber, "#ffea00", "#ff9800", "#ffd600", "#ff6d00",
  C.magenta, "#ff1744", "#ff4569", "#ff6b35", "#e5004f",
  "#b44fff", "#818cf8", "#34d399", "#f472b6", "#fbbf24",
];

const SAVE_STORAGE_KEY = "cardiovis-phase-config";

// ─── Phase factory ────────────────────────────────────────────────────────────

function makePhaseItem(overrides?: Partial<PhaseItem>): PhaseItem {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    name: overrides?.name ?? "New Phase",
    presetId: overrides?.presetId ?? "surgical",
    config: { ...DEFAULT_PHASE_CONFIG },
    isCustom: overrides?.isCustom ?? true,
    ...overrides,
  };
}

// ─── Setup Wizard Props ───────────────────────────────────────────────────────

interface SetupWizardProps {
  phases: PhaseItem[];
  activePhaseId: string;
  activePhaseConfig: PhaseConfig;
  onSelectPhase: (id: string) => void;
  onAddPhase: () => void;
  onDeletePhase: (id: string) => void;
  onRenamePhase: (id: string, name: string) => void;
  onDuplicatePhase: (id: string) => void;
  onUpdateConfig: (updates: Partial<PhaseConfig>) => void;
  onApplyPreset: (presetId: string) => void;
  onUpdateZone: (zone: NamedZone) => void;
  onAddZone: () => void;
  onDeleteZone: (id: string) => void;
  onToggleTargetAssist: (option: TargetAssistOption) => void;
  onSave: () => void;
  onEnter: () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AICopilotLayout({
  features,
  initialMasks,
  initialPoints,
}: AICopilotLayoutProps) {
  const [activeTab, setActiveTab] = useState<AppTab>("video");
  const [isConfigured, setIsConfigured] = useState(false);

  const defaultFeature = useMemo(
    () => features.find((feature) => feature.enabled) ?? features[0],
    [features]
  );
  const [selectedFeature, setSelectedFeature] = useState<FeatureId>(
    defaultFeature?.id ?? "feature_1"
  );

  const activeFeature = useMemo(
    () => features.find((feature) => feature.id === selectedFeature) ?? defaultFeature,
    [defaultFeature, features, selectedFeature]
  );

  const activeComponent = activeFeature?.componentOverrides?.[activeTab] ?? "default";
  const prefetchedFeatureDir = defaultFeature?.dir ?? "";

  // ── Phase state ──
  const [phases, setPhases] = useState<PhaseItem[]>(() => {
    if (typeof window === "undefined") {
      return [{ id: "phase-1", name: "Phase 1", presetId: "surgical", config: { ...DEFAULT_PHASE_CONFIG }, isCustom: false }];
    }
    try {
      const saved = localStorage.getItem(SAVE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as PhaseItem[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return [{ id: "phase-1", name: "Phase 1", presetId: "surgical", config: { ...DEFAULT_PHASE_CONFIG }, isCustom: false }];
  });
  const [activePhaseId, setActivePhaseId] = useState(phases[0].id);

  const savePhases = () => {
    try {
      localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(phases));
    } catch { /* ignore */ }
  };

  const activePhase = useMemo(
    () => phases.find((p) => p.id === activePhaseId) ?? phases[0],
    [phases, activePhaseId]
  );

  const activePhaseConfig = activePhase?.config ?? DEFAULT_PHASE_CONFIG;

  // ── Phase mutations ──
  const addPhase = () => {
    const num = phases.length + 1;
    const newPhase = makePhaseItem({ name: `Phase ${num}` });
    setPhases((prev) => [...prev, newPhase]);
    setActivePhaseId(newPhase.id);
  };

  const deletePhase = (id: string) => {
    if (phases.length <= 1) return;
    setPhases((prev) => prev.filter((p) => p.id !== id));
    if (activePhaseId === id) {
      setActivePhaseId(phases[0].id);
    }
  };

  const renamePhase = (id: string, name: string) => {
    setPhases((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name: name.trim() || "Phase" } : p))
    );
  };

  const duplicatePhase = (id: string) => {
    const src = phases.find((p) => p.id === id);
    if (!src) return;
    const copy = makePhaseItem({
      name: `${src.name} copy`,
      config: JSON.parse(JSON.stringify(src.config)),
      presetId: src.presetId,
      isCustom: true,
    });
    setPhases((prev) => [...prev, copy]);
    setActivePhaseId(copy.id);
  };

  const updatePhaseConfig = (updates: Partial<PhaseConfig>) => {
    setPhases((prev) =>
      prev.map((p) =>
        p.id === activePhaseId
          ? { ...p, config: { ...p.config, ...updates }, presetId: "custom" }
          : p
      )
    );
  };

  const applyPreset = (presetId: string) => {
    const preset = PRESETS[presetId];
    if (!preset) return;
    setPhases((prev) =>
      prev.map((p) =>
        p.id === activePhaseId
          ? {
              ...p,
              presetId,
              config: {
                ...preset.config,
                overlayColors: p.config.overlayColors,
              },
            }
          : p
      )
    );
  };

  const updateZoneColor = (zone: NamedZone) => {
    updatePhaseConfig({
      overlayColors: activePhaseConfig.overlayColors.map((z) =>
        z.id === zone.id ? zone : z
      ),
    });
  };

  const addZone = () => {
    const newZone: NamedZone = {
      id: crypto.randomUUID(),
      name: `Zone ${activePhaseConfig.overlayColors.length + 1}`,
      color: ZONE_PALETTE[activePhaseConfig.overlayColors.length % ZONE_PALETTE.length],
    };
    updatePhaseConfig({
      overlayColors: [...activePhaseConfig.overlayColors, newZone],
    });
  };

  const deleteZone = (id: string) => {
    if (activePhaseConfig.overlayColors.length <= 1) return;
    updatePhaseConfig({
      overlayColors: activePhaseConfig.overlayColors.filter((z) => z.id !== id),
    });
  };

  const toggleTargetAssist = (option: TargetAssistOption) => {
    const opts = activePhaseConfig.targetAssistOptions;
    const next = opts.includes(option)
      ? opts.filter((o) => o !== option)
      : [...opts, option];
    updatePhaseConfig({ targetAssistOptions: next });
  };

  if (!isConfigured) {
    return (
      <SetupWizard
        phases={phases}
        activePhaseId={activePhaseId}
        activePhaseConfig={activePhaseConfig}
        onSelectPhase={setActivePhaseId}
        onAddPhase={addPhase}
        onDeletePhase={deletePhase}
        onRenamePhase={renamePhase}
        onDuplicatePhase={duplicatePhase}
        onUpdateConfig={updatePhaseConfig}
        onApplyPreset={applyPreset}
        onUpdateZone={updateZoneColor}
        onAddZone={addZone}
        onDeleteZone={deleteZone}
        onToggleTargetAssist={toggleTargetAssist}
        onSave={savePhases}
        onEnter={() => { setActiveTab("video"); setIsConfigured(true); }}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ backgroundColor: C.bg }}>
      <CyberpunkHeader
        selectedFeature={selectedFeature}
        features={features}
        onFeatureChange={(id) => setSelectedFeature(id as FeatureId)}
        onTabToggle={() => setActiveTab(activeTab === "video" ? "gallery" : "video")}
        activeTab={activeTab}
        guidanceMode={activePhaseConfig.guidanceMode}
        onPersonalize={() => setIsConfigured(false)}
      />
      <div className="flex flex-1 overflow-hidden">
        {activeComponent === "feature2" ? (
          <Feature2Tab activeTab={activeTab} feature={activeFeature} />
        ) : activeComponent === "feature3" ? (
          <Feature3VideoTab
            key={`${activeFeature?.id ?? "unknown"}-${activeTab}`}
            initialDir={activeFeature?.dir ?? ""}
            initialMasks={initialMasks}
            initialPoints={initialPoints}
            prefetchedDir={prefetchedFeatureDir}
            surgicalWorkspace
            initialShowOverlay={activePhaseConfig.showOverlay}
            initialShowFullLabels={activePhaseConfig.showFullLabels}
            initialShowToolZones={activePhaseConfig.showToolZones}
            guidanceMode={activePhaseConfig.guidanceMode}
            overlayColors={{
              target: activePhaseConfig.overlayColors[0]?.color ?? C.lime,
              avoid: activePhaseConfig.overlayColors[1]?.color ?? C.amber,
              danger: activePhaseConfig.overlayColors[2]?.color ?? C.magenta,
            }}
            targetIconStyle={activePhaseConfig.targetIconStyle}
          />
        ) : activeTab === "gallery" ? (
          <ImageGalleryTab
            key={`${activeFeature?.id ?? "unknown"}-gallery`}
            initialMasks={initialMasks}
            initialPoints={initialPoints}
            initialDir={activeFeature?.dir ?? ""}
          />
        ) : (
          <VideoPlayerTab
            key={`${activeFeature?.id ?? "unknown"}-video`}
            initialDir={activeFeature?.dir ?? ""}
            initialMasks={initialMasks}
            initialPoints={initialPoints}
            prefetchedDir={prefetchedFeatureDir}
            surgicalWorkspace
            initialShowOverlay={activePhaseConfig.showOverlay}
            initialShowFullLabels={activePhaseConfig.showFullLabels}
            guidanceMode={activePhaseConfig.guidanceMode}
            overlayColors={{
              target: activePhaseConfig.overlayColors[0]?.color ?? C.lime,
              avoid: activePhaseConfig.overlayColors[1]?.color ?? C.amber,
              danger: activePhaseConfig.overlayColors[2]?.color ?? C.magenta,
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Cyberpunk Header ─────────────────────────────────────────────────────────

function CyberpunkHeader({
  selectedFeature,
  features,
  onFeatureChange,
  onTabToggle,
  activeTab,
  guidanceMode,
  onPersonalize,
}: {
  selectedFeature: FeatureId;
  features: FeatureConfig[];
  onFeatureChange: (id: string) => void;
  onTabToggle: () => void;
  activeTab: AppTab;
  guidanceMode: string;
  onPersonalize: () => void;
}) {
  return (
    <header
      className="flex min-h-[52px] items-center justify-between gap-3 px-4"
      style={{
        background: `linear-gradient(180deg, ${C.bg2} 0%, ${C.bg} 100%)`,
        borderBottom: `1px solid ${C.border}`,
        boxShadow: `0 0 20px ${C.cyan}08, 0 4px 16px rgba(0,0,0,0.4)`,
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* Cyberpunk logo */}
        <div className="relative flex items-center gap-0">
          <CornerBrackets size={28} color={C.cyan} />
          <span
            className="ml-1 text-sm font-black tracking-[0.2em] uppercase"
            style={{ color: C.cyan, textShadow: `0 0 10px ${C.cyan}80` }}
          >
            CV
          </span>
        </div>

        <div className="h-5 w-px" style={{ background: `linear-gradient(180deg, transparent, ${C.border}, transparent)` }} />

        <select
          value={selectedFeature}
          onChange={(e) => onFeatureChange(e.target.value)}
          className="h-8 rounded border text-xs font-medium outline-none transition-all"
          style={{
            background: `${C.bg}80`,
            borderColor: C.border,
            color: C.text,
            boxShadow: `inset 0 0 8px ${C.cyan}08`,
          }}
        >
          {features.map((f) => (
            <option key={f.id} value={f.id} disabled={!f.enabled}>
              {f.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onTabToggle}
          className="h-8 rounded border px-3 text-xs font-medium transition-all hover:border-cyan-500/50"
          style={{
            background: `${C.bg}80`,
            borderColor: C.border,
            color: C.textDim,
            boxShadow: `inset 0 0 8px ${C.cyan}05`,
          }}
        >
          {activeTab === "video" ? "Dataset" : "Video"}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span
          className="rounded border px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
          style={{
            borderColor: `${C.cyan}40`,
            color: C.cyan,
            background: `${C.cyan}10`,
            boxShadow: `0 0 8px ${C.cyan}20`,
          }}
        >
          {guidanceMode}
        </span>

        <button
          type="button"
          onClick={onPersonalize}
          className="h-8 rounded border px-3 text-xs font-medium transition-all"
          style={{
            background: `${C.purple}15`,
            borderColor: `${C.purple}40`,
            color: C.purple,
            boxShadow: `0 0 8px ${C.purple}15`,
          }}
        >
          Personalize
        </button>
      </div>
    </header>
  );
}

// ─── Corner Brackets ──────────────────────────────────────────────────────────

function CornerBrackets({ size = 24, color = C.cyan, thickness = 2 }: { size?: number; color?: string; thickness?: number }) {
  const s = size;
  const t = thickness;
  const g = 3;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} className="block shrink-0">
      <path d={`M${t / 2} ${g} L${t / 2} ${t / 2} L${g} ${t / 2}`} fill="none" stroke={color} strokeWidth={t} strokeLinecap="square" />
      <path d={`M${s - g} ${t / 2} L${s - t / 2} ${t / 2} L${s - t / 2} ${g}`} fill="none" stroke={color} strokeWidth={t} strokeLinecap="square" />
      <path d={`M${t / 2} ${s - g} L${t / 2} ${s - t / 2} L${g} ${s - t / 2}`} fill="none" stroke={color} strokeWidth={t} strokeLinecap="square" />
      <path d={`M${s - g} ${s - t / 2} L${s - t / 2} ${s - t / 2} L${s - t / 2} ${s - g}`} fill="none" stroke={color} strokeWidth={t} strokeLinecap="square" />
    </svg>
  );
}

// ─── Setup Wizard ────────────────────────────────────────────────────────────

function SetupWizard({
  phases,
  activePhaseId,
  activePhaseConfig,
  onSelectPhase,
  onAddPhase,
  onDeletePhase,
  onRenamePhase,
  onDuplicatePhase,
  onUpdateConfig,
  onApplyPreset,
  onUpdateZone,
  onAddZone,
  onDeleteZone,
  onToggleTargetAssist,
  onSave,
  onEnter,
}: SetupWizardProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [saveFlash, setSaveFlash] = useState(false);
  const [previewHint, setPreviewHint] = useState<string>("guidance");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const activePhase = phases.find((p) => p.id === activePhaseId) ?? phases[0];

  const startRename = (phase: PhaseItem) => {
    setRenamingId(phase.id);
    setRenameValue(phase.name);
  };

  const commitRename = () => {
    if (renamingId) onRenamePhase(renamingId, renameValue);
    setRenamingId(null);
  };

  const startDrag = (id: string) => setDraggedId(id);
  const overDrag = (e: React.DragEvent, id: string) => { e.preventDefault(); setDragOverId(id); };
  const endDrag = () => { setDraggedId(null); setDragOverId(null); };

  return (
    <div
      className="relative flex h-screen w-screen overflow-hidden"
      style={{ backgroundColor: C.bg }}
    >
      {/* ── Animated grid background ── */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage: `
            linear-gradient(${C.gridLine}18 1px, transparent 1px),
            linear-gradient(90deg, ${C.gridLine}18 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
          backgroundPosition: `0 0px`,
        }}
      />
      {/* Scanline overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.03]"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,229,255,0.3) 2px, rgba(0,229,255,0.3) 4px)",
        }}
      />

      {/* Radial glow */}
      <div
        className="pointer-events-none absolute left-1/4 top-0 z-0 h-96 w-96 -translate-x-1/2 rounded-full opacity-20 blur-3xl"
        style={{ background: `radial-gradient(circle, ${C.cyan}30, transparent 70%)` }}
      />
      <div
        className="pointer-events-none absolute bottom-0 right-1/4 z-0 h-96 w-96 translate-x-1/2 rounded-full opacity-15 blur-3xl"
        style={{ background: `radial-gradient(circle, ${C.magenta}30, transparent 70%)` }}
      />

      {/* ── Left panel ── */}
      <aside
        className="relative z-10 flex w-64 shrink-0 flex-col"
        style={{
          background: `linear-gradient(180deg, ${C.bg2}ee 0%, ${C.bg}ee 100%)`,
          borderRight: `1px solid ${C.border}`,
          boxShadow: `4px 0 24px rgba(0,0,0,0.4), inset -1px 0 0 ${C.cyan}15`,
        }}
      >
        {/* Header */}
        <div className="border-b border-white/[0.05] px-4 py-5" style={{ borderColor: `${C.border}60` }}>
          <div className="flex items-center gap-2">
            <CornerBrackets size={22} color={C.cyan} thickness={1.5} />
            <span
              className="text-[10px] font-black uppercase tracking-[0.25em]"
              style={{ color: C.cyan, textShadow: `0 0 8px ${C.cyan}60` }}
            >
              Cardiovis
            </span>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <div
              className="h-px flex-1"
              style={{ background: `linear-gradient(90deg, ${C.cyan}, transparent)` }}
            />
            <span
              className="text-[9px] font-bold uppercase tracking-[0.2em]"
              style={{ color: C.textDim }}
            >
              Phase Manager
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: C.textDim }}>
            Configure each phase independently for optimal surgical guidance.
          </p>
        </div>

        {/* Phase list */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: C.textDarker }}>
              Phases
            </span>
            <span
              className="text-[9px] font-mono font-bold"
              style={{ color: C.cyan, textShadow: `0 0 6px ${C.cyan}60` }}
            >
              {phases.length.toString().padStart(2, "0")}
            </span>
          </div>

          <div className="space-y-1.5">
            {phases.map((phase, idx) => {
              const isActive = phase.id === activePhaseId;
              const isDragOver = phase.id === dragOverId;
              const isDragging = phase.id === draggedId;
              return (
                <div
                  key={phase.id}
                  draggable
                  onDragStart={() => startDrag(phase.id)}
                  onDragOver={(e) => overDrag(e, phase.id)}
                  onDragLeave={() => setDragOverId(null)}
                  onDrop={() => endDrag()}
                  onDragEnd={endDrag}
                  onClick={() => onSelectPhase(phase.id)}
                  className={`
                    group relative cursor-pointer rounded transition-all duration-150
                    ${isDragging ? "opacity-30 scale-95" : ""}
                  `}
                  style={
                    isDragOver
                      ? { borderColor: C.cyan, backgroundColor: `${C.cyan}10`, transform: "scale(1.02)" }
                      : isActive
                      ? {
                          background: `linear-gradient(135deg, ${C.bg3} 0%, ${C.cyan}08 100%)`,
                          borderColor: `${C.cyan}50`,
                          boxShadow: `0 0 12px ${C.cyan}15, inset 0 0 8px ${C.cyan}08`,
                        }
                      : {
                          background: `${C.bg3}`,
                          borderColor: `${C.border}60`,
                        }
                  }
                >
                  {/* Active top accent line */}
                  {isActive && (
                    <div
                      className="absolute -left-3 top-1/2 h-4 w-1.5 -translate-y-1/2 rounded-r"
                      style={{
                        background: `linear-gradient(180deg, ${C.cyan}, ${C.cyan}60)`,
                        boxShadow: `0 0 8px ${C.cyan}`,
                      }}
                    />
                  )}

                  <div className="flex items-center gap-2 px-3 py-2.5">
                    {/* Drag handle */}
                    <span
                      className="cursor-grab text-[10px] opacity-0 transition-opacity group-hover:opacity-60 active:cursor-grabbing"
                      style={{ color: C.textDim }}
                    >
                      ⣿
                    </span>

                    {/* Phase number */}
                    <div
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-black"
                      style={
                        isActive
                          ? { background: `${phase.config.overlayColors[0]?.color ?? C.magenta}25`, color: phase.config.overlayColors[0]?.color ?? C.magenta, boxShadow: `0 0 8px ${phase.config.overlayColors[0]?.color ?? C.magenta}40` }
                          : { background: `${C.border}40`, color: C.textDim }
                      }
                    >
                      {idx + 1}
                    </div>

                    {/* Name */}
                    {renamingId === phase.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="min-w-0 flex-1 bg-transparent text-xs font-bold outline-none"
                        style={{ color: C.text, borderBottom: `1px solid ${C.cyan}` }}
                      />
                    ) : (
                      <span
                        className={`min-w-0 flex-1 truncate text-xs font-bold ${isActive ? "" : ""}`}
                        style={{ color: isActive ? C.text : C.textDim }}
                      >
                        {phase.name}
                      </span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div
                    className={`absolute right-2 top-1/2 -translate-y-1/2 items-center gap-0.5 ${isActive ? "flex" : "hidden group-hover:flex"}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <IconBtn title="Rename" onClick={() => startRename(phase)}>
                      <PencilIcon />
                    </IconBtn>
                    <IconBtn title="Duplicate" onClick={() => onDuplicatePhase(phase.id)}>
                      <DuplicateIcon />
                    </IconBtn>
                    {phases.length > 1 && (
                      <IconBtn
                        title="Delete"
                        onClick={() => onDeletePhase(phase.id)}
                        hoverColor={C.magenta}
                      >
                        <TrashIcon />
                      </IconBtn>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add phase */}
          <button
            type="button"
            onClick={onAddPhase}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded py-2 text-xs font-bold uppercase tracking-wider transition-all"
            style={{
              border: `1px dashed ${C.border}`,
              color: C.textDim,
            }}
          >
            <PlusIcon />
            Add phase
          </button>
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-4 space-y-2" style={{ borderColor: `${C.border}60` }}>
          <button
            type="button"
            onClick={() => { onSave(); setSaveFlash(true); setTimeout(() => setSaveFlash(false), 1200); }}
            className="flex w-full items-center justify-center gap-2 rounded py-2.5 text-xs font-bold uppercase tracking-wider transition-all"
            style={{
              border: `1px solid ${saveFlash ? C.lime : C.border}`,
              color: saveFlash ? C.lime : C.textDim,
              background: saveFlash ? `${C.lime}10` : "transparent",
              boxShadow: saveFlash ? `0 0 12px ${C.lime}30` : "none",
            }}
          >
            <SaveIcon />
            {saveFlash ? "Saved!" : "Save config"}
          </button>
          <button
            type="button"
            onClick={onEnter}
            className="group relative flex w-full items-center justify-center gap-2 rounded py-3 text-sm font-black uppercase tracking-wider text-black transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: `linear-gradient(135deg, ${C.cyan} 0%, ${C.cyanDim} 100%)`,
              boxShadow: `0 0 20px ${C.cyan}40, 0 4px 12px rgba(0,0,0,0.4)`,
            }}
          >
            <CornerBrackets size={16} color="#000" thickness={2} />
            <span>Enter workspace</span>
            <span
              className="transition-transform group-hover:translate-x-1"
              style={{ textShadow: "none" }}
            >
              →
            </span>
          </button>
        </div>
      </aside>

      {/* ── Right panel ── */}
      <main className="relative z-10 flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden">
        {/* Top bar */}
        <div
          className="flex items-center justify-between px-6 py-3 shrink-0"
          style={{
            borderBottom: `1px solid ${C.border}`,
            background: `${C.bg2}80`,
            boxShadow: `0 4px 16px rgba(0,0,0,0.3)`,
          }}
        >
          <div className="flex items-center gap-3">
            <CornerBrackets size={20} color={C.cyan} thickness={1.5} />
            <div>
              <h3 className="text-sm font-black uppercase tracking-wide" style={{ color: C.text }}>
                {activePhase?.name ?? "Phase"}
              </h3>
              <p className="text-[10px]" style={{ color: C.textDim }}>
                Configure overlay settings for this phase
              </p>
            </div>
          </div>

          {/* Presets */}
          <div className="flex items-center gap-2">
            <span
              className="text-[9px] font-bold uppercase tracking-widest"
              style={{ color: C.textDarker }}
            >
              Presets:
            </span>
            {PRESET_KEYS.map((key) => {
              const preset = PRESETS[key];
              const isActive = activePhase?.presetId === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onApplyPreset(key)}
                  className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-all"
                  style={
                    isActive
                      ? {
                          borderColor: C.cyan,
                          color: C.cyan,
                          background: `${C.cyan}15`,
                          boxShadow: `0 0 8px ${C.cyan}30`,
                        }
                      : {
                          borderColor: `${C.border}80`,
                          color: C.textDim,
                          background: `${C.bg3}`,
                        }
                  }
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable config area */}
        <div className="flex flex-1 overflow-y-auto">
          <div className="grid w-full grid-cols-[1fr_440px] gap-0">

            {/* ── Left: Config ── */}
            <div className="space-y-6 px-6 py-5" style={{ borderRight: `1px solid ${C.border}40` }}>

              {/* Guidance mode */}
              <CyberSection
                label="Guidance Mode"
                hint="How the copilot communicates with the surgeon."
              >
                <div className="grid grid-cols-3 gap-2">
                  {GUIDANCE_OPTIONS.map((opt) => {
                    const isActive = activePhaseConfig.guidanceMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onUpdateConfig({ guidanceMode: opt.id })}
                        onMouseEnter={() => setPreviewHint("guidance")}
                        className="flex flex-col items-center gap-2 rounded py-3 text-center transition-all"
                        style={
                          isActive
                            ? {
                                borderColor: `${C.cyan}60`,
                                background: `${C.cyan}10`,
                                boxShadow: `0 0 10px ${C.cyan}20, inset 0 0 8px ${C.cyan}08`,
                              }
                            : {
                                borderColor: `${C.border}60`,
                                background: `${C.bg3}`,
                              }
                        }
                      >
                        <GuidanceIcon mode={opt.id} active={isActive} />
                        <span
                          className="text-xs font-bold uppercase tracking-wider"
                          style={{ color: isActive ? C.cyan : C.textDim }}
                        >
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs" style={{ color: C.textDim }}>
                  {GUIDANCE_OPTIONS.find((o) => o.id === activePhaseConfig.guidanceMode)?.copy}
                </p>
              </CyberSection>

              {/* Zone colors */}
              <CyberSection
                label="Zone Colors"
                hint="Name each anatomical region and assign it a neon color."
              >
                <div className="space-y-3">
                  {activePhaseConfig.overlayColors.map((zone) => (
                    <ZoneEditor
                      key={zone.id}
                      zone={zone}
                      onUpdate={onUpdateZone}
                      onDelete={activePhaseConfig.overlayColors.length > 1 ? () => onDeleteZone(zone.id) : undefined}
                    />
                  ))}

                  {/* Add zone */}
                  <button
                    type="button"
                    onClick={onAddZone}
                    className="flex w-full items-center justify-center gap-2 rounded py-2 text-xs font-bold uppercase tracking-wider transition-all"
                    style={{ border: `1px dashed ${C.border}`, color: C.textDim }}
                  >
                    <PlusIcon />
                    Add zone
                  </button>
                </div>
              </CyberSection>

              {/* Target icon */}
              <CyberSection
                label="Target Icon"
                hint="Choose the visual reticle used for targeting."
              >
                <div className="grid grid-cols-3 gap-2">
                  {TARGET_ICON_OPTIONS.map((opt) => {
                    const isActive = activePhaseConfig.targetIconStyle === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onUpdateConfig({ targetIconStyle: opt.id })}
                        onMouseEnter={() => setPreviewHint("target")}
                        className="flex flex-col items-center gap-2 rounded py-3 transition-all"
                        style={
                          isActive
                            ? {
                                borderColor: `${C.lime}60`,
                                background: `${C.lime}08`,
                                boxShadow: `0 0 10px ${C.lime}20`,
                              }
                            : {
                                borderColor: `${C.border}60`,
                                background: `${C.bg3}`,
                              }
                        }
                      >
                        <TargetIconPreview styleName={opt.id} color={activePhaseConfig.overlayColors[0]?.color ?? C.lime} />
                        <span className="text-xs font-bold" style={{ color: isActive ? C.lime : C.textDim }}>
                          {opt.label}
                        </span>
                        <span className="text-[10px]" style={{ color: C.textDarker }}>{opt.copy}</span>
                      </button>
                    );
                  })}
                </div>
              </CyberSection>

              {/* Target behavior */}
              <CyberSection
                label="Target Behavior"
                hint="Select which assist features are active."
              >
                <div className="grid grid-cols-3 gap-2">
                  {TARGET_ASSIST_OPTIONS.map((opt) => {
                    const isActive = activePhaseConfig.targetAssistOptions.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onToggleTargetAssist(opt.id)}
                        onMouseEnter={() => setPreviewHint("target")}
                        className="flex items-center gap-2 rounded px-3 py-2.5 text-left transition-all"
                        style={
                          isActive
                            ? {
                                borderColor: `${C.lime}40`,
                                background: `${C.lime}08`,
                                boxShadow: `0 0 8px ${C.lime}15`,
                              }
                            : {
                                borderColor: `${C.border}60`,
                                background: `${C.bg3}`,
                              }
                        }
                      >
                        <span
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded"
                          style={
                            isActive
                              ? { background: C.lime, boxShadow: `0 0 6px ${C.lime}` }
                              : { border: `1px solid ${C.border}`, background: "transparent" }
                          }
                        >
                          {isActive && <CheckIcon />}
                        </span>
                        <div>
                          <div className="text-xs font-bold" style={{ color: isActive ? C.lime : C.textDim }}>
                            {opt.label}
                          </div>
                          <div className="text-[10px]" style={{ color: C.textDarker }}>{opt.copy}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CyberSection>

              {/* Visual assist */}
              <CyberSection
                label="Visual Assist"
                hint="General display options."
              >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <CyberToggle
                    label="Overlay"
                    active={activePhaseConfig.showOverlay}
                    onClick={() => onUpdateConfig({ showOverlay: !activePhaseConfig.showOverlay })}
                  />
                  <CyberToggle
                    label="Full labels"
                    active={activePhaseConfig.showFullLabels}
                    onClick={() => onUpdateConfig({ showFullLabels: !activePhaseConfig.showFullLabels })}
                  />
                  <CyberToggle
                    label="Tool zones"
                    active={activePhaseConfig.showToolZones}
                    onClick={() => onUpdateConfig({ showToolZones: !activePhaseConfig.showToolZones })}
                  />
                  <CyberRiskToggle
                    value={activePhaseConfig.riskSensitivity}
                    onChange={(v) => onUpdateConfig({ riskSensitivity: v })}
                  />
                </div>
              </CyberSection>
            </div>

            {/* ── Right: Live Preview ── */}
            <div
              className="flex flex-col"
              style={{ background: `${C.bg}80` }}
            >
              <div
                className="flex items-center gap-2 border-b px-4 py-3"
                style={{ borderColor: `${C.border}40` }}
              >
                <div
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: C.lime,
                    boxShadow: `0 0 8px ${C.lime}`,
                    animation: "pulse 2s ease-in-out infinite",
                  }}
                />
                <span
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: C.lime, textShadow: `0 0 8px ${C.lime}60` }}
                >
                  Live Preview
                </span>
                <div className="ml-auto flex gap-1">
                  <span className="text-[9px] font-mono font-bold" style={{ color: C.textDarker }}>
                    SYS.01
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <CyberpunkPreview
                  config={activePhaseConfig}
                  hint={previewHint}
                  onHintChange={setPreviewHint}
                />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Cyberpunk Section ───────────────────────────────────────────────────────

function CyberSection({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-lg p-4"
      style={{
        background: `${C.bg3}`,
        border: `1px solid ${C.border}40`,
        boxShadow: `0 0 12px ${C.cyan}05`,
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <CornerBrackets size={14} color={C.cyan} thickness={1} />
        <div>
          <h3
            className="text-xs font-black uppercase tracking-widest"
            style={{ color: C.cyan, textShadow: `0 0 8px ${C.cyan}50` }}
          >
            {label}
          </h3>
          <p className="text-[10px]" style={{ color: C.textDim }}>{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

// ─── Cyberpunk Toggle ─────────────────────────────────────────────────────────

function CyberToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between rounded px-3 py-2.5 text-left transition-all"
      style={
        active
          ? {
              borderColor: `${C.cyan}50`,
              background: `${C.cyan}10`,
              boxShadow: `0 0 8px ${C.cyan}15`,
            }
          : {
              borderColor: `${C.border}60`,
              background: `${C.bg3}`,
            }
      }
    >
      <span className="text-xs font-bold" style={{ color: active ? C.cyan : C.textDim }}>
        {label}
      </span>
      <span
        className="h-5 w-10 shrink-0 rounded-full p-0.5 transition-colors"
        style={{ background: active ? C.cyan : C.border }}
      >
        <span
          className="block h-4 w-4 rounded-full bg-white shadow transition-transform"
          style={{ transform: active ? "translateX(20px)" : "translateX(0)", boxShadow: active ? `0 0 8px ${C.cyan}` : "none" }}
        />
      </span>
    </button>
  );
}

// ─── Risk Toggle ──────────────────────────────────────────────────────────────

function CyberRiskToggle({
  value,
  onChange,
}: {
  value: "standard" | "high";
  onChange: (v: "standard" | "high") => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(value === "standard" ? "high" : "standard")}
      className="flex flex-col items-center gap-1 rounded px-3 py-2.5 text-center transition-all"
      style={
        value === "high"
          ? {
              borderColor: `${C.magenta}60`,
              background: `${C.magenta}10`,
              boxShadow: `0 0 8px ${C.magenta}15`,
            }
          : {
              borderColor: `${C.border}60`,
              background: `${C.bg3}`,
            }
      }
    >
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.textDim }}>
        Risk
      </span>
      <span
        className="text-[10px] font-black uppercase tracking-wider"
        style={{ color: value === "high" ? C.magenta : C.textDarker }}
      >
        {value}
      </span>
    </button>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function DuplicateIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ─── Guidance Icon ───────────────────────────────────────────────────────────

function GuidanceIcon({ mode, active }: { mode: GuidanceMode; active: boolean }) {
  const color = active ? C.cyan : C.textDarker;
  if (mode === "voice") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    );
  }
  if (mode === "both") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
        <line x1="17" y1="10" x2="21" y2="10" />
        <line x1="21" y1="6" x2="17" y2="6" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="17" y1="10" x2="3" y2="10" />
      <line x1="21" y1="6" x2="3" y2="6" />
      <line x1="21" y1="14" x2="3" y2="14" />
      <line x1="17" y1="18" x2="3" y2="18" />
    </svg>
  );
}

// ─── Icon Button ─────────────────────────────────────────────────────────────

function IconBtn({
  title,
  onClick,
  hoverColor,
  children,
}: {
  title: string;
  onClick: () => void;
  hoverColor?: string;
  children: React.ReactNode;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="flex h-6 w-6 items-center justify-center rounded transition-all"
      style={{
        color: hov && hoverColor ? hoverColor : C.textDim,
        background: hov && hoverColor ? `${hoverColor}15` : "transparent",
        boxShadow: hov && hoverColor ? `0 0 6px ${hoverColor}30` : "none",
      }}
    >
      {children}
    </button>
  );
}

// ─── Zone Editor ───────────────────────────────────────────────────────────────

function ZoneEditor({
  zone,
  onUpdate,
  onDelete,
}: {
  zone: NamedZone;
  onUpdate: (zone: NamedZone) => void;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(zone.name);

  const commit = () => {
    const trimmedName = nameVal.trim() || zone.name;
    const nameChanged = trimmedName !== zone.name;
    if (nameChanged) {
      const { color } = getSemanticColor(trimmedName);
      onUpdate({ ...zone, name: trimmedName, color });
    } else {
      onUpdate(zone);
    }
    setEditing(false);
  };

  return (
    <div
      className="flex items-center gap-2 rounded p-2 transition-all"
      style={{
        border: `1px solid ${zone.color}30`,
        background: `${zone.color}06`,
        boxShadow: `0 0 8px ${zone.color}10`,
      }}
    >
      {/* Color swatch */}
      <div
        className="h-5 w-5 shrink-0 rounded-full"
        style={{
          background: zone.color,
          boxShadow: `0 0 8px ${zone.color}`,
        }}
      />

      {/* Name */}
      {editing ? (
        <input
          autoFocus
          value={nameVal}
          onChange={(e) => setNameVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setNameVal(zone.name); setEditing(false); }
          }}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 bg-transparent text-xs font-bold outline-none"
          style={{ color: C.text, borderBottom: `1px solid ${zone.color}` }}
        />
      ) : (
        <span
          className="min-w-0 flex-1 truncate text-xs font-bold"
          style={{ color: zone.color }}
          onDoubleClick={() => setEditing(true)}
        >
          {zone.name}
        </span>
      )}

      {/* Palette */}
      <div className="hidden flex-wrap gap-1 sm:flex">
        {ZONE_PALETTE.slice(0, 8).map((color) => {
          const isSelected = zone.color === color;
          return (
            <button
              key={color}
              type="button"
              title={color}
              onClick={() => onUpdate({ ...zone, color })}
              className="rounded-full transition-all hover:scale-125"
              style={
                isSelected
                  ? {
                      width: 16,
                      height: 16,
                      border: `1.5px solid white`,
                      boxShadow: `0 0 6px ${color}`,
                      background: color,
                    }
                  : {
                      width: 12,
                      height: 12,
                      border: `1px solid ${color}60`,
                      background: color,
                    }
              }
            />
          );
        })}
      </div>

      {/* Color picker */}
      <input
        type="color"
        value={zone.color}
        onChange={(e) => onUpdate({ ...zone, color: e.target.value })}
        className="h-6 w-6 cursor-pointer rounded-full border"
        style={{ borderColor: `${C.border}80`, background: "transparent" }}
        title="Custom color"
      />

      {/* Delete */}
      {onDelete && (
        <button
          type="button"
          title="Delete zone"
          onClick={onDelete}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded transition-all"
          style={{ color: C.textDim }}
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );
}

// ─── Cyberpunk Preview ───────────────────────────────────────────────────────

function CyberpunkPreview({
  config,
  hint,
  onHintChange,
}: {
  config: PhaseConfig;
  hint: string;
  onHintChange: (h: string) => void;
}) {
  const zones = config.overlayColors;
  const targetZone = zones[0];
  const firstHintZone = zones.find((z) => z.id === hint) ?? targetZone ?? { title: "Zone", body: "Hover over a zone.", color: C.cyan };

  const hintData = {
    target: { title: targetZone?.name ?? "Target", body: "Use a bright neon color. Marks the structure the surgeon should align around.", color: targetZone?.color ?? C.lime },
    guidance: { title: "Guidance Output", body: "Voice is best for live surgery. Text works for demos and review.", color: C.cyan },
    ...Object.fromEntries(zones.map((z) => [z.id, { title: z.name, body: `Zone: ${z.name}. Assign a color that maximizes visibility.`, color: z.color }])),
  }[hint] ?? { title: firstHintZone.name, body: `Zone: ${firstHintZone.name}.`, color: firstHintZone.color };

  return (
    <div className="space-y-3">
      {/* HUD viewport */}
      <div
        className="relative overflow-hidden rounded-lg"
        style={{
          background: `radial-gradient(ellipse_at_48%_40%,rgba(60,30,80,0.6),rgba(20,5,40,0.85)_42%,rgba(2,8,23,1)_76%)`,
          border: `1px solid ${C.border}`,
          boxShadow: `0 0 20px ${C.cyan}08, inset 0 0 20px rgba(0,0,0,0.4)`,
        }}
      >
        {/* Corner markers */}
        {[["top-left", 0, 0], ["top-right", 1, 0], ["bottom-left", 0, 1], ["bottom-right", 1, 1]].map(([pos, x, y]) => (
          <div
            key={pos as string}
            className="absolute h-3 w-3"
            style={{
              top: y === 0 ? 4 : undefined,
              bottom: y === 1 ? 4 : undefined,
              left: x === 0 ? 4 : undefined,
              right: x === 1 ? 4 : undefined,
              borderTop: y === 0 ? `2px solid ${C.cyan}` : "none",
              borderBottom: y === 1 ? `2px solid ${C.cyan}` : "none",
              borderLeft: x === 0 ? `2px solid ${C.cyan}` : "none",
              borderRight: x === 1 ? `2px solid ${C.cyan}` : "none",
              boxShadow: `0 0 4px ${C.cyan}60`,
            }}
          />
        ))}

        {/* Scanline */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,229,255,0.4) 3px, rgba(0,229,255,0.4) 4px)" }}
        />

        <div className="relative min-h-52" style={{ aspectRatio: "16/9" }}>
          {/* Dynamic zones */}
          {zones.slice(0, 3).map((zone, idx) => {
            const positions = [
              "left-[46%] top-[36%] h-[28%] w-[20%] rounded-[48%]",
              "left-[28%] top-[53%] h-[23%] w-[28%] rounded-[45%]",
              "left-[63%] top-[59%] h-[22%] w-[23%] rounded-[42%]",
            ];
            return (
              <PreviewZone
                key={zone.id}
                label={zone.name.toUpperCase()}
                color={zone.color}
                className={positions[idx] ?? "left-[50%] top-[50%] h-[20%] w-[20%] rounded-full"}
                onHover={() => onHintChange(zone.id)}
              />
            );
          })}

          {/* Target icon */}
          <div className="absolute left-[55%] top-[47%] -translate-x-1/2 -translate-y-1/2" onMouseEnter={() => onHintChange(zones[0]?.id ?? "")}>
            <TargetIconPreview styleName={config.targetIconStyle} color={targetZone?.color ?? C.lime} large />
          </div>

          {/* Halo */}
          {config.targetAssistOptions.includes("confidence-halo") && (
            <div
              className="absolute left-[55%] top-[47%] h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ border: `2px solid ${targetZone?.color ?? C.lime}`, boxShadow: `0 0 24px ${targetZone?.color ?? C.lime}50` }}
            />
          )}
          {config.targetAssistOptions.includes("approach-vector") && (
            <div
              className="absolute left-[16%] top-[26%] h-0.5 w-[35%] origin-right rotate-[18deg] rounded-full"
              style={{ background: targetZone?.color ?? C.lime, boxShadow: `0 0 12px ${targetZone?.color ?? C.lime}` }}
            />
          )}
          {config.targetAssistOptions.includes("distance-cue") && (
            <div
              className="absolute right-[12%] top-[33%] rounded px-2 py-1 text-[10px] font-bold"
              style={{ border: `1px solid ${C.border}`, color: C.text, background: `${C.bg}cc` }}
            >
              8.2 mm
            </div>
          )}
          {config.targetAssistOptions.includes("label-anchor") && (
            <div
              className="absolute left-[61%] top-[26%] rounded px-2 py-1 text-[10px] font-bold"
              style={{ border: `1px solid ${targetZone?.color ?? C.lime}60`, color: targetZone?.color ?? C.lime, background: `${C.bg}dd`, boxShadow: `0 0 6px ${targetZone?.color ?? C.lime}30` }}
            >
              {targetZone?.name.toUpperCase() ?? "TARGET"}
            </div>
          )}

          {/* Guidance transcript */}
          {(config.guidanceMode === "text" || config.guidanceMode === "both") && (
            <div
              className="absolute bottom-3 left-3 max-w-[250px] rounded px-3 py-2 text-xs leading-relaxed"
              style={{
                border: `1px solid ${C.cyan}30`,
                color: C.cyan,
                background: `${C.bg}cc`,
                boxShadow: `0 0 8px ${C.cyan}20`,
              }}
              onMouseEnter={() => onHintChange("guidance")}
            >
              Critical anatomy visible. Maintain overlay vigilance.
            </div>
          )}

          {/* Status */}
          <div
            className="absolute right-3 top-3 rounded px-2 py-1 text-[9px] font-black uppercase tracking-widest"
            style={{
              border: `1px solid ${C.border}`,
              color: config.showOverlay ? C.lime : C.textDarker,
              background: `${C.bg}cc`,
              boxShadow: config.showOverlay ? `0 0 6px ${C.lime}40` : "none",
            }}
          >
            {config.showOverlay ? "● overlay on" : "○ overlay off"}
          </div>

          {/* Reticle crosshair at center */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 opacity-30">
            <div className="absolute left-1/2 top-0 h-1/2 w-px -translate-x-1/2" style={{ background: "white" }} />
            <div className="absolute left-0 top-1/2 h-px w-1/2 -translate-y-1/2" style={{ background: "white" }} />
          </div>
        </div>
      </div>

      {/* Tooltip */}
      <div
        className="rounded-lg p-4"
        style={{
          background: `${C.bg3}`,
          border: `1px solid ${C.border}40`,
          boxShadow: `0 0 12px ${hintData.color}10`,
        }}
      >
        <div className="mb-2 flex items-center gap-2">
          <CornerBrackets size={12} color={hintData.color} thickness={1} />
          <span
            className="text-[10px] font-black uppercase tracking-widest"
            style={{ color: hintData.color, textShadow: `0 0 8px ${hintData.color}60` }}
          >
            {hintData.title}
          </span>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: C.textDim }}>{hintData.body}</p>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: "GUIDANCE", value: config.guidanceMode, color: C.cyan },
            { label: "ICON", value: config.targetIconStyle, color: C.lime },
            { label: "RISK", value: config.riskSensitivity, color: config.riskSensitivity === "high" ? C.magenta : C.textDim },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="flex flex-col items-center rounded px-2 py-2"
              style={{ border: `1px solid ${C.border}40`, background: `${C.bg}60` }}
            >
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: C.textDarker }}>{label}</span>
              <span className="mt-0.5 text-[10px] font-black uppercase" style={{ color }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Preview Zone ─────────────────────────────────────────────────────────────

function PreviewZone({
  label,
  color,
  className,
  onHover,
}: {
  label: string;
  color: string;
  className: string;
  onHover: () => void;
}) {
  return (
    <div
      className={`absolute ${className}`}
      style={{
        border: `2px solid ${color}`,
        background: `${color}18`,
        boxShadow: `0 0 20px ${color}40, inset 0 0 12px ${color}15`,
      }}
      onMouseEnter={onHover}
    >
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider"
        style={{ color, background: `${C.bg}ee`, boxShadow: `0 0 8px ${color}40` }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Target Icon Preview ──────────────────────────────────────────────────────

function TargetIconPreview({
  styleName,
  color,
  large = false,
}: {
  styleName: TargetIconStyle;
  color: string;
  large?: boolean;
}) {
  const size = large ? 80 : 38;
  const center = size / 2;
  const radius = large ? 20 : 10;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
      {styleName === "pulse" ? (
        <>
          <circle cx={center} cy={center} r={radius + 10} fill={`${color}18`} stroke={color} strokeWidth="2" opacity="0.6" />
          <circle cx={center} cy={center} r={radius * 0.45} fill={`${color}60`} stroke={color} strokeWidth="2" />
        </>
      ) : styleName === "crosshair" ? (
        <>
          <circle cx={center} cy={center} r={radius} fill="none" stroke={color} strokeWidth="2" strokeDasharray="4 5" />
          <line x1={center - radius - 12} y1={center} x2={center - 5} y2={center} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <line x1={center + 5} y1={center} x2={center + radius + 12} y2={center} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <line x1={center} y1={center - radius - 12} x2={center} y2={center - 5} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <line x1={center} y1={center + 5} x2={center} y2={center + radius + 12} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx={center} cy={center} r="3.5" fill={`${color}80`} />
        </>
      ) : (
        <>
          <circle cx={center} cy={center} r={radius + 4} fill={`${color}24`} stroke={color} strokeWidth="2" />
          <circle cx={center} cy={center} r={radius * 0.56} fill="none" stroke={`${color}80`} strokeWidth="1.5" />
          <line x1={center - radius - 10} y1={center} x2={center - radius * 0.45} y2={center} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <line x1={center + radius * 0.45} y1={center} x2={center + radius + 10} y2={center} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <line x1={center} y1={center - radius - 10} x2={center} y2={center - radius * 0.45} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <line x1={center} y1={center + radius * 0.45} x2={center} y2={center + radius + 10} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx={center} cy={center} r="3.8" fill={`${color}80`} stroke={color} strokeWidth="1.8" />
        </>
      )}
    </svg>
  );
}
