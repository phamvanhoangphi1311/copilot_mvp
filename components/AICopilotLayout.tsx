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

interface AICopilotLayoutProps {
  features: FeatureConfig[];
  initialMasks: Array<{ image: string; tags: SegmentationTag[] }>;
  initialPoints: BoundaryRecord[];
}

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

interface SurgeonConfig {
  guidanceMode: GuidanceMode;
  showOverlay: boolean;
  showFullLabels: boolean;
  showToolZones: boolean;
  riskSensitivity: RiskSensitivity;
  overlayColors: {
    target: string;
    avoid: string;
    danger: string;
  };
  targetIconStyle: TargetIconStyle;
  targetAssistOptions: TargetAssistOption[];
}

const GUIDANCE_OPTIONS: Array<{
  id: GuidanceMode;
  label: string;
  copy: string;
}> = [
  { id: "voice", label: "Voice first", copy: "Audio alerts stay off-screen unless risk changes." },
  { id: "both", label: "Voice + text", copy: "Short voice prompts with a compact text transcript." },
  { id: "text", label: "Text only", copy: "Silent guidance for review, demo, or noisy rooms." },
];

const DEFAULT_CONFIG: SurgeonConfig = {
  guidanceMode: "both",
  showOverlay: true,
  showFullLabels: false,
  showToolZones: false,
  riskSensitivity: "standard",
  overlayColors: {
    target: "#16A34A",
    avoid: "#F59E0B",
    danger: "#EF4444",
  },
  targetIconStyle: "reticle",
  targetAssistOptions: ["target-lock", "confidence-halo", "label-anchor"],
};

const TARGET_ICON_OPTIONS: Array<{
  id: TargetIconStyle;
  label: string;
  copy: string;
}> = [
  { id: "reticle", label: "Reticle", copy: "Best for precise structure targeting." },
  { id: "crosshair", label: "Crosshair", copy: "Sharper, low-fill visual marker." },
  { id: "pulse", label: "Pulse", copy: "High-salience marker for teaching." },
];

const COLOR_PRESETS = [
  { name: "Surgical default", target: "#16A34A", avoid: "#F59E0B", danger: "#EF4444" },
  { name: "High contrast", target: "#38BDF8", avoid: "#FACC15", danger: "#F43F5E" },
  { name: "Muted field", target: "#22C55E", avoid: "#FB923C", danger: "#E11D48" },
];

const TARGET_ASSIST_OPTIONS: Array<{
  id: TargetAssistOption;
  label: string;
  copy: string;
}> = [
  { id: "target-lock", label: "Lock", copy: "Keep marker fixed on target." },
  { id: "confidence-halo", label: "Halo", copy: "Show target confidence." },
  { id: "approach-vector", label: "Vector", copy: "Show approach direction." },
  { id: "distance-cue", label: "Distance", copy: "Add compact spacing cue." },
  { id: "label-anchor", label: "Anchor", copy: "Pin target label nearby." },
  { id: "low-light-boost", label: "Boost", copy: "Increase contrast in dark frames." },
];

export default function AICopilotLayout({
  features,
  initialMasks,
  initialPoints,
}: AICopilotLayoutProps) {
  const [activeTab, setActiveTab] = useState<AppTab>("video");
  const [isConfigured, setIsConfigured] = useState(false);
  const [config, setConfig] = useState<SurgeonConfig>(DEFAULT_CONFIG);
  const [previewHint, setPreviewHint] = useState<"target" | "avoid" | "danger" | "guidance">("target");
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

  const updateConfig = <Key extends keyof SurgeonConfig>(
    key: Key,
    value: SurgeonConfig[Key]
  ) => {
    setConfig((current) => ({ ...current, [key]: value }));
  };

  const updateOverlayColor = (
    key: keyof SurgeonConfig["overlayColors"],
    value: string
  ) => {
    setConfig((current) => ({
      ...current,
      overlayColors: {
        ...current.overlayColors,
        [key]: value,
      },
    }));
  };

  const toggleTargetAssist = (option: TargetAssistOption) => {
    setConfig((current) => {
      const hasOption = current.targetAssistOptions.includes(option);
      return {
        ...current,
        targetAssistOptions: hasOption
          ? current.targetAssistOptions.filter((item) => item !== option)
          : [...current.targetAssistOptions, option],
      };
    });
  };

  if (!isConfigured) {
    return (
      <main className="flex min-h-screen bg-[#05080c] text-zinc-100">
        <section className="flex flex-1 flex-col justify-center px-5 py-4 sm:px-8 lg:px-10">
          <div className="mx-auto grid w-full max-w-7xl gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div className="space-y-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                  CARDIOVIS setup
                </div>
                <h1 className="mt-6 max-w-xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
                  Personalize the surgical copilot before entering the field.
                </h1>
                <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400">
                  Hover the preview, tune colors and guidance density, then enter a clean video workspace with the controls parked beside the feed.
                </p>
              </div>

              <PreviewConsole
                config={config}
                hint={previewHint}
                onHintChange={setPreviewHint}
              />
            </div>

            <div className="max-h-[90vh] overflow-y-auto rounded-lg border border-white/[0.08] bg-[#091019]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
              <div className="space-y-4">
                <section>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                      Phase
                    </span>
                    <span className="truncate text-xs text-zinc-500">
                      {activeFeature?.summary ?? "Phase-specific surgical guidance"}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg border border-white/[0.08] bg-black/25 p-1">
                    {features.map((feature) => {
                      const selected = selectedFeature === feature.id;
                      return (
                        <button
                          key={feature.id}
                          type="button"
                          disabled={!feature.enabled}
                          onClick={() => feature.enabled && setSelectedFeature(feature.id)}
                          onMouseEnter={() => setPreviewHint("guidance")}
                          className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                            selected
                              ? "bg-cyan-300/16 text-cyan-100"
                              : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
                          } ${!feature.enabled ? "cursor-not-allowed opacity-45" : ""}`}
                        >
                          {feature.label.replace("Phase ", "P")}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                      Guidance
                    </label>
                    <span className="text-xs text-zinc-500">
                      {GUIDANCE_OPTIONS.find((option) => option.id === config.guidanceMode)?.copy}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg border border-white/[0.08] bg-black/25 p-1">
                    {GUIDANCE_OPTIONS.map((option) => {
                      const selected = config.guidanceMode === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => updateConfig("guidanceMode", option.id)}
                          onMouseEnter={() => setPreviewHint("guidance")}
                          className={`rounded-md px-2 py-2 text-center text-sm font-semibold transition-colors ${
                            selected
                              ? "bg-emerald-300/14 text-emerald-100"
                              : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
                          }`}
                        >
                          {option.label.replace(" first", "").replace(" + ", "+")}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                      Overlay colors
                    </label>
                    <div className="flex gap-1.5">
                      {COLOR_PRESETS.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          title={preset.name}
                          onClick={() => updateConfig("overlayColors", {
                            target: preset.target,
                            avoid: preset.avoid,
                            danger: preset.danger,
                          })}
                          className="flex rounded border border-white/[0.08] bg-white/[0.03] p-1 transition-colors hover:bg-white/[0.07]"
                        >
                          {[preset.target, preset.avoid, preset.danger].map((color) => (
                            <span key={color} className="h-4 w-4 first:rounded-l-sm last:rounded-r-sm" style={{ backgroundColor: color }} />
                          ))}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <ColorControl
                      label="Target"
                      value={config.overlayColors.target}
                      onChange={(value) => updateOverlayColor("target", value)}
                      onFocus={() => setPreviewHint("target")}
                    />
                    <ColorControl
                      label="Avoid"
                      value={config.overlayColors.avoid}
                      onChange={(value) => updateOverlayColor("avoid", value)}
                      onFocus={() => setPreviewHint("avoid")}
                    />
                    <ColorControl
                      label="Danger"
                      value={config.overlayColors.danger}
                      onChange={(value) => updateOverlayColor("danger", value)}
                      onFocus={() => setPreviewHint("danger")}
                    />
                  </div>
                </section>

                <section>
                  <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                    Target icon style
                  </label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {TARGET_ICON_OPTIONS.map((option) => {
                      const selected = config.targetIconStyle === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => updateConfig("targetIconStyle", option.id)}
                          onMouseEnter={() => setPreviewHint("target")}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                            selected
                              ? "border-cyan-300/40 bg-cyan-300/10 text-white"
                              : "border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.055]"
                          }`}
                        >
                          <TargetIconPreview styleName={option.id} color={config.overlayColors.target} />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">{option.label}</span>
                            <span className="mt-0.5 block truncate text-xs text-zinc-500">{option.copy}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                    Target behavior
                  </label>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {TARGET_ASSIST_OPTIONS.map((option) => {
                      const selected = config.targetAssistOptions.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleTargetAssist(option.id)}
                          onMouseEnter={() => setPreviewHint("target")}
                          className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                            selected
                              ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-50"
                              : "border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.055]"
                          }`}
                        >
                          <span className="block text-sm font-semibold">{option.label}</span>
                          <span className="mt-0.5 block truncate text-xs text-zinc-500">{option.copy}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                    Visual assist
                  </label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-4">
                    <ToggleChoice
                      label="Overlay visible"
                      active={config.showOverlay}
                      onClick={() => updateConfig("showOverlay", !config.showOverlay)}
                    />
                    <ToggleChoice
                      label="Full labels"
                      active={config.showFullLabels}
                      onClick={() => updateConfig("showFullLabels", !config.showFullLabels)}
                    />
                    <ToggleChoice
                      label="Tool zones"
                      active={config.showToolZones}
                      onClick={() => updateConfig("showToolZones", !config.showToolZones)}
                    />
                    <button
                      type="button"
                      onClick={() => updateConfig("riskSensitivity", config.riskSensitivity === "standard" ? "high" : "standard")}
                      className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-left transition-colors hover:bg-white/[0.055]"
                    >
                      <span className="block text-sm font-semibold text-zinc-100">
                        Risk sensitivity
                      </span>
                      <span className="mt-1 block text-xs capitalize text-zinc-500">
                        {config.riskSensitivity}
                      </span>
                    </button>
                  </div>
                </section>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("video");
                    setIsConfigured(true);
                  }}
                  className="w-full rounded-lg border border-cyan-300/35 bg-cyan-300/18 px-4 py-3 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/24"
                >
                  Enter surgical video workspace
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#030507] text-zinc-100">
      <header className="z-40 flex min-h-12 items-center justify-between gap-3 border-b border-white/[0.06] bg-[#050b11]/94 px-4 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded border border-cyan-300/20 bg-cyan-300/10 text-xs font-semibold text-cyan-100">
            CV
          </div>
          <select
            id="feature-selector"
            value={selectedFeature}
            onChange={(event) => setSelectedFeature(event.target.value as FeatureId)}
            className="h-8 rounded border border-white/[0.08] bg-black/30 px-2 text-xs font-medium text-zinc-100 outline-none"
          >
            {features.map((feature) => (
              <option key={feature.id} value={feature.id} disabled={!feature.enabled}>
                {feature.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setActiveTab(activeTab === "video" ? "gallery" : "video")}
            className="h-8 rounded border border-white/[0.08] bg-white/[0.035] px-3 text-xs text-zinc-300 transition-colors hover:bg-white/[0.07]"
          >
            {activeTab === "video" ? "Dataset" : "Video"}
          </button>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <span className="hidden rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1 sm:inline">
            Guidance: {config.guidanceMode}
          </span>
          <button
            type="button"
            onClick={() => setIsConfigured(false)}
            className="h-8 rounded border border-white/[0.08] bg-white/[0.035] px-3 text-xs text-zinc-300 transition-colors hover:bg-white/[0.07]"
          >
            Personalize
          </button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        {activeComponent === "feature2" ? (
          <Feature2Tab
            key={`${activeFeature?.id ?? "unknown"}-${activeTab}`}
            activeTab={activeTab}
            feature={activeFeature}
          />
        ) : activeComponent === "feature3" ? (
          <Feature3VideoTab
            key={`${activeFeature?.id ?? "unknown"}-${activeTab}`}
            initialDir={activeFeature?.dir ?? ""}
            initialMasks={initialMasks}
            initialPoints={initialPoints}
            prefetchedDir={prefetchedFeatureDir}
            surgicalWorkspace
            initialShowOverlay={config.showOverlay}
            initialShowFullLabels={config.showFullLabels}
            initialShowToolZones={config.showToolZones}
            guidanceMode={config.guidanceMode}
            overlayColors={config.overlayColors}
            targetIconStyle={config.targetIconStyle}
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
            initialShowOverlay={config.showOverlay}
            initialShowFullLabels={config.showFullLabels}
            guidanceMode={config.guidanceMode}
            overlayColors={config.overlayColors}
          />
        )}
      </div>
    </div>
  );
}

function PreviewConsole({
  config,
  hint,
  onHintChange,
}: {
  config: SurgeonConfig;
  hint: "target" | "avoid" | "danger" | "guidance";
  onHintChange: (hint: "target" | "avoid" | "danger" | "guidance") => void;
}) {
  const hintCopy = {
    target: {
      title: "Target zone",
      body: "Use the brightest, most trusted color here. It marks the structure the doctor should align around.",
    },
    avoid: {
      title: "Avoid zone",
      body: "This should be noticeable but calmer than danger. Good for adjacent anatomy that deserves attention.",
    },
    danger: {
      title: "Danger zone",
      body: "Reserve the highest urgency color for boundaries where distraction is better than missing the warning.",
    },
    guidance: {
      title: "Guidance output",
      body: "Voice is best for live surgery. Text is useful as a small confirmation layer or for demos.",
    },
  }[hint];

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-[#080d13]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.55)]" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Live preview
          </span>
        </div>
        <span className="text-[11px] text-zinc-500">Hover zones for guidance</span>
      </div>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="relative aspect-video min-h-64 overflow-hidden bg-[radial-gradient(circle_at_48%_44%,rgba(140,74,52,0.55),rgba(52,14,18,0.72)_42%,rgba(8,10,14,1)_76%)]">
          <div className="absolute left-[10%] top-[14%] h-[72%] w-[78%] rounded-[48%] border border-white/[0.04] bg-[radial-gradient(circle_at_44%_42%,rgba(255,217,188,0.24),rgba(158,63,49,0.18)_34%,rgba(0,0,0,0)_65%)] blur-[1px]" />
          <PreviewZone
            label="Target"
            color={config.overlayColors.target}
            className="left-[48%] top-[38%] h-[26%] w-[18%] rounded-[48%]"
            onHover={() => onHintChange("target")}
          />
          <PreviewZone
            label="Avoid"
            color={config.overlayColors.avoid}
            className="left-[32%] top-[51%] h-[21%] w-[24%] rounded-[45%]"
            onHover={() => onHintChange("avoid")}
          />
          <PreviewZone
            label="Danger"
            color={config.overlayColors.danger}
            className="left-[61%] top-[57%] h-[20%] w-[21%] rounded-[42%]"
            onHover={() => onHintChange("danger")}
          />
          <div
            className="absolute left-[57%] top-[49%] -translate-x-1/2 -translate-y-1/2"
            onMouseEnter={() => onHintChange("target")}
          >
            <TargetIconPreview styleName={config.targetIconStyle} color={config.overlayColors.target} large />
          </div>
          {config.targetAssistOptions.includes("confidence-halo") && (
            <div
              className="absolute left-[57%] top-[49%] h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border"
              style={{
                borderColor: config.overlayColors.target,
                boxShadow: `0 0 30px ${config.overlayColors.target}55`,
              }}
            />
          )}
          {config.targetAssistOptions.includes("approach-vector") && (
            <div
              className="absolute left-[20%] top-[28%] h-0.5 w-[34%] origin-right rotate-[18deg] rounded-full"
              style={{ backgroundColor: config.overlayColors.target, boxShadow: `0 0 16px ${config.overlayColors.target}` }}
            />
          )}
          {config.targetAssistOptions.includes("distance-cue") && (
            <div className="absolute right-[15%] top-[35%] rounded border border-white/[0.12] bg-black/60 px-2 py-1 text-[10px] font-semibold text-zinc-100">
              8.2 mm
            </div>
          )}
          {config.targetAssistOptions.includes("label-anchor") && (
            <div className="absolute left-[61%] top-[28%] rounded border border-white/[0.12] bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">
              AR target
            </div>
          )}
          {(config.guidanceMode === "text" || config.guidanceMode === "both") && (
            <div
              className="absolute bottom-3 left-3 max-w-[280px] rounded border border-emerald-300/20 bg-black/65 px-3 py-2 text-xs leading-5 text-emerald-100"
              onMouseEnter={() => onHintChange("guidance")}
            >
              Critical anatomy visible. Maintain target and danger overlays.
            </div>
          )}
          <div className="absolute right-3 top-3 rounded border border-white/[0.08] bg-black/55 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-300">
            {config.showOverlay ? "overlay on" : "overlay off"}
          </div>
        </div>
        <div className="min-w-0 border-t border-white/[0.06] bg-black/20 p-4 lg:border-l lg:border-t-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Tooltip
          </div>
          <h2 className="mt-3 text-base font-semibold text-white">{hintCopy.title}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{hintCopy.body}</p>
          <div className="mt-5 grid gap-2 text-xs">
            <div className="flex items-center justify-between rounded border border-white/[0.06] bg-white/[0.03] px-3 py-2">
              <span className="text-zinc-500">Guidance</span>
              <span className="capitalize text-zinc-200">{config.guidanceMode}</span>
            </div>
            <div className="flex items-center justify-between rounded border border-white/[0.06] bg-white/[0.03] px-3 py-2">
              <span className="text-zinc-500">Icon</span>
              <span className="capitalize text-zinc-200">{config.targetIconStyle}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
      className={`absolute border-2 border-dashed bg-transparent ${className}`}
      style={{
        borderColor: color,
        backgroundColor: `${color}28`,
        boxShadow: `0 0 22px ${color}55`,
      }}
      onMouseEnter={onHover}
    >
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        {label}
      </span>
    </div>
  );
}

function ColorControl({
  label,
  value,
  onChange,
  onFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
}) {
  return (
    <label
      className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-2 transition-colors hover:bg-white/[0.055]"
      onMouseEnter={onFocus}
    >
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-9 cursor-pointer rounded border border-white/[0.12] bg-transparent"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-zinc-100">{label}</span>
      </span>
      <span className="text-[11px] font-medium uppercase text-zinc-500">{value}</span>
    </label>
  );
}

function TargetIconPreview({
  styleName,
  color,
  large = false,
}: {
  styleName: TargetIconStyle;
  color: string;
  large?: boolean;
}) {
  const size = large ? 86 : 38;
  const center = size / 2;
  const radius = large ? 22 : 10;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
      {styleName === "pulse" ? (
        <>
          <circle cx={center} cy={center} r={radius + 10} fill={`${color}18`} stroke={color} strokeWidth="2" opacity="0.55" />
          <circle cx={center} cy={center} r={radius * 0.45} fill="#dcfce7" stroke={color} strokeWidth="2" />
        </>
      ) : styleName === "crosshair" ? (
        <>
          <circle cx={center} cy={center} r={radius} fill="none" stroke={color} strokeWidth="2" strokeDasharray="4 5" />
          <line x1={center - radius - 12} y1={center} x2={center - 5} y2={center} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <line x1={center + 5} y1={center} x2={center + radius + 12} y2={center} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <line x1={center} y1={center - radius - 12} x2={center} y2={center - 5} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <line x1={center} y1={center + 5} x2={center} y2={center + radius + 12} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx={center} cy={center} r="3.5" fill="#dcfce7" />
        </>
      ) : (
        <>
          <circle cx={center} cy={center} r={radius + 4} fill={`${color}24`} stroke={color} strokeWidth="2" />
          <circle cx={center} cy={center} r={radius * 0.56} fill="none" stroke="#dcfce7" strokeWidth="1.5" />
          <line x1={center - radius - 10} y1={center} x2={center - radius * 0.45} y2={center} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <line x1={center + radius * 0.45} y1={center} x2={center + radius + 10} y2={center} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <line x1={center} y1={center - radius - 10} x2={center} y2={center - radius * 0.45} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <line x1={center} y1={center + radius * 0.45} x2={center} y2={center + radius + 10} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx={center} cy={center} r="3.8" fill="#dcfce7" stroke={color} strokeWidth="1.8" />
        </>
      )}
    </svg>
  );
}

function ToggleChoice({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between rounded-lg border px-3 py-3 text-left transition-colors ${
        active
          ? "border-cyan-300/35 bg-cyan-300/10 text-white"
          : "border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.055]"
      }`}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className={`h-5 w-9 rounded-full p-0.5 transition-colors ${active ? "bg-cyan-300/70" : "bg-zinc-800"}`}>
        <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${active ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}
