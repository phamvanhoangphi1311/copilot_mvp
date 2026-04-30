/**
 * overlayConfig.ts
 *
 * Central configuration for all canvas overlay rendering:
 *   – Boundary (polygon) overlay
 *   – Segmentation (RLE mask) overlay
 *
 * Edit the values here to change how overlays look without touching
 * render logic in rleDecoder.ts.
 */

// ── Boundary line ─────────────────────────────────────────────────────────────

export const boundaryLine = {
  /**
   * Fixed stroke width in pixels.
   * Set to 0 to auto-scale with canvas resolution using `autoScaleDivisor`.
   */
  lineWidth: 0,

  /**
   * Used when lineWidth === 0:
   *   computedWidth = max(minWidth, round(canvasWidth / autoScaleDivisor))
   */
  autoScaleDivisor: 760,

  /** Minimum stroke width when auto-scaling (px). */
  minWidth: 2,

  /** Stroke style: "solid" or "dashed". */
  style: "dashed" as "solid" | "dashed",

  /** Length of each dash in pixels (only used when style === "dashed"). */
  dashLength: 6,

  /** Length of each gap in pixels (only used when style === "dashed"). */
  gapLength: 8,

  /** Stroke opacity (0–1). Applied on top of the per-label colour. */
  opacity: 0.96,
};

// ── Boundary fill ─────────────────────────────────────────────────────────────

export const boundaryFill = {
  /** Semi-transparent fill opacity for the polygon interior (0–1). */
  opacity: 0.08,
};

// ── Label badge (shared by boundary and segmentation overlays) ────────────────

export const overlayLabel = {
  /**
   * Fixed font size in pixels.
   * Set to 0 to auto-scale: fontSize = max(minFontSize, round(canvasWidth / autoScaleDivisor))
   */
  fontSize: 0,

  /** Divisor for auto-scaling font size. */
  autoScaleDivisor: 110,

  /** Minimum font size when auto-scaling (px). */
  minFontSize: 14,

  /** Horizontal inner padding of the badge (px). */
  paddingX: 8,

  /** Vertical inner padding of the badge (px). */
  paddingY: 5,

  /** Corner radius of the badge rectangle (px). */
  borderRadius: 4,

  /** Opacity of the dark badge background. */
  backgroundOpacity: 0.75,

  /** Width of the coloured border drawn around the badge (px). */
  borderWidth: 1.5,
};

// ── labels ──────────────────────────────────────────────────────────────

export const DANGER_LABELS = new Set<string>([
  "Phrenic nerve",
  "Aortic root",
  "Auricles",
  "MV anterior annulus",
  "MV posterior annulus"
]);
export const SAFE_LABELS = new Set<string>([
  "Pericardium",
  "Grasper",
  "Needle holders",
  "Anterior MV (A1)",
  "Anterior MV (A2)"
]);
export const TOOL_LABELS = new Set<string>([
  "Grasper",
  "Needle holders",
]);
export const OTHER_LABELS = new Set<string>([
  "Epicardial adipose tissue",
  "Epicardial fat on aortic"
]);
export const IGNORED_LABELS = new Set<string>([
  // "Instrument 0",
  // "Instrument 1",
  // "Retractor",
  // "Artificial Chordae",
  // "MV annuloplasty suture"
]);

// ── Segmentation mask ─────────────────────────────────────────────────────────

export const segmentationMask = {
  /** Fill opacity applied to all RLE mask pixels (0–1). */
  opacity: 0.25,
};

// ── Annotation line (open polyline, e.g. Centerline) ─────────────────────────

export const annotationLine = {
  /**
   * Fixed stroke width in pixels.
   * Set to 0 to auto-scale: computedWidth = max(minWidth, round(canvasWidth / autoScaleDivisor))
   */
  lineWidth: 3,

  /** Divisor for auto-scaling line width. */
  autoScaleDivisor: 320,

  /** Minimum stroke width when auto-scaling (px). */
  minWidth: 3,

  /** Stroke style: "solid" or "dashed". */
  style: "dashed" as "solid" | "dashed",

  /** Length of each dash in pixels (only used when style === "dashed"). */
  dashLength: 9,

  /** Length of each gap in pixels (only used when style === "dashed"). */
  gapLength: 7,

  /** Stroke opacity (0–1). */
  opacity: 1,

  /** Whether to draw a label badge at the line midpoint. */
  showLabel: true,

  /** Gradient area rendered around the line, similar to safe-zone area bands. */
  area: {
    /** Number of concentric band passes (0 = disabled). */
    bands: 4,
    /** Outer edge color (CSS hex). */
    outerColor: "#facc15",
    /** Total band thickness in pixels (outer edge width). */
    width: 420,
    /** Peak opacity of the innermost band. */
    opacity: 0.16,
  },
};

// ── Label colour maps (moved from rleDecoder.ts) ─────────────────────────────

/** Curated per-label colours (CSS hex) used by overlays. */
export const KNOWN_COLORS: Record<string, string> = {
  "Phrenic nerve": "#3296FF",
  Grasper: "#32DC64",
  Pericardium: "#FF5050",
  "Epicardial adipose tissue": "#F97316",
  "Incision line": "#32DC50",
  Centerline: "#32DC50",
  "Anterior MV (A1)": "#0096C8",
  "Anterior MV (A2)": "#00E6C8",
  "MV anterior annulus": "#ADFF2F",
  "MV posterior annulus": "#2DD4BF",
  "Native Chordae": "#FFC300",
  "Posterior MV (P1)": "#FF5A5A",
  "Posterior MV (P2)": "#FF8246",
  "Posterior MV (P3)": "#FF6EB4",
  "Posterior Papillary Muscle MV": "#7D4BFF",
};

/** Fallback palette (cycled for unknown labels). */
export const EXTRA_COLORS: string[] = [
  "#B464FF",
  "#FFA032",
  "#64FFFF",
  "#FF64C8",
];
