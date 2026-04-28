/**
 * overlayConfig.ts
 *
 * Role-based color system optimized for contrast against cardiac tissue
 * (warm pinks, reds, oranges). Complementary cool tones stand out best.
 *
 *   TARGET  = green       — suture target, max visibility
 *   AVOID   = red         — critical structure, stay away
 *   CAUTION = orange      — be aware
 *   TOOL    = blue/teal   — instruments
 */

// ── Boundary line ─────────────────────────────────────────────────────────
export const boundaryLine = {
  lineWidth: 1.8,
  autoScaleDivisor: 800,
  minWidth: 1.5,
  style: "solid" as "solid" | "dashed",
  dashLength: 14,
  gapLength: 6,
  opacity: 0.9,
};

// ── Boundary fill ─────────────────────────────────────────────────────────
export const boundaryFill = { opacity: 0.02 };

// ── Glow config per role ──────────────────────────────────────────────────
export const glowProfiles: Record<string, {
  passes: number; maxBlur: number; opacity: number; extraWidth: number;
  innerBlur: number; innerOpacity: number; innerExtra: number;
}> = {
  target: {
    passes: 5, maxBlur: 28, opacity: 0.58, extraWidth: 12,
    innerBlur: 8, innerOpacity: 0.9, innerExtra: 4,
  },
  avoid: {
    passes: 2, maxBlur: 14, opacity: 0.32, extraWidth: 6,
    innerBlur: 6, innerOpacity: 0.7, innerExtra: 3,
  },
  caution: {
    passes: 2, maxBlur: 14, opacity: 0.32, extraWidth: 6,
    innerBlur: 5, innerOpacity: 0.6, innerExtra: 2,
  },
  tool: {
    passes: 2, maxBlur: 12, opacity: 0.24, extraWidth: 5,
    innerBlur: 4, innerOpacity: 0.5, innerExtra: 2,
  },
};

// ── Label badge ───────────────────────────────────────────────────────────
export const overlayLabel = {
  fontSize: 0,
  autoScaleDivisor: 145,
  minFontSize: 11,
  paddingX: 10,
  paddingY: 5,
  borderRadius: 4,
  backgroundOpacity: 0.76,
  borderWidth: 1.5,
  showAccent: true,
  accentWidth: 3,
};

// ── ROLE CLASSIFICATION ───────────────────────────────────────────────────
export const TARGET_LABELS = new Set<string>(["Aortic root"]);
export const AVOID_LABELS = new Set<string>(["Auricles"]);
export const CAUTION_LABELS = new Set<string>(["Epicardial fat on aortic"]);
export const TOOL_LABELS = new Set<string>(["Grasper", "Needle holders"]);

// Legacy exports (used by ZoneFactory)
export const DANGER_LABELS = AVOID_LABELS;
export const SAFE_LABELS = TOOL_LABELS;
export const OTHER_LABELS = CAUTION_LABELS;
export const IGNORED_LABELS = new Set<string>([
  "Epicardial adipose tissue", "Pericardium", "Phrenic nerve",
]);

// ── Segmentation mask ─────────────────────────────────────────────────────
export const segmentationMask = { opacity: 0.14 };

// ── Annotation line ──────────────────────────────────────────────────────
export const annotationLine = {
  lineWidth: 1.8, autoScaleDivisor: 400, minWidth: 1.5,
  style: "dashed" as "solid" | "dashed",
  dashLength: 16, gapLength: 8, opacity: 0.85, showLabel: true,
  area: { bands: 4, outerColor: "#facc15", width: 400, opacity: 0.05 },
};

// ── NEON COLORS ──────────────────────────────────────────────────────────
export const KNOWN_COLORS: Record<string, string> = {
  "Aortic root": "#22C55E",
  "Auricles": "#EF4444",
  "Epicardial fat on aortic": "#FFAA00",
  "Grasper": "#3B82F6",
  "Needle holders": "#88EEFF",
};

export const EXTRA_COLORS: string[] = ["#AA66FF", "#FF44AA", "#00FFCC", "#FFEE00"];

// ── Role → color mapping ─────────────────────────────────────────────────
export const ROLE_COLORS: Record<string, string> = {
  target: "#22C55E",
  avoid: "#EF4444",
  caution: "#FFAA00",
  tool: "#3B82F6",
  unknown: "#AA66FF",
};

export const CLASSIFICATION_GLOW = ROLE_COLORS;

export function getRole(label: string): string {
  if (TARGET_LABELS.has(label)) return "target";
  if (AVOID_LABELS.has(label)) return "avoid";
  if (CAUTION_LABELS.has(label)) return "caution";
  if (TOOL_LABELS.has(label)) return "tool";
  return "unknown";
}
