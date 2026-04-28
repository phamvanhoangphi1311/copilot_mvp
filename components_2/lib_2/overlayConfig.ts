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
  lineWidth: 4,

  /**
   * Used when lineWidth === 0:
   *   computedWidth = max(minWidth, round(canvasWidth / autoScaleDivisor))
   */
  autoScaleDivisor: 600,

  /** Minimum stroke width when auto-scaling (px). */
  minWidth: 2,

  /** Stroke style: "solid" or "dashed". */
  style: "dashed" as "solid" | "dashed",

  /** Length of each dash in pixels (only used when style === "dashed"). */
  dashLength: 8,

  /** Length of each gap in pixels (only used when style === "dashed"). */
  gapLength: 8,

  /** Stroke opacity (0–1). Applied on top of the per-label colour. */
  opacity: 1,
};

// ── Boundary fill ─────────────────────────────────────────────────────────────

export const boundaryFill = {
  /** Semi-transparent fill opacity for the polygon interior (0–1). */
  opacity: 0.2,
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

  /** Whether to draw the border as dashes. */
  borderDashed: true,

  /** Dash array when borderDashed is true: [dash, gap]. */
  borderDash: [4, 3],
};

// ── Segmentation mask ─────────────────────────────────────────────────────────

export const segmentationMask = {
  /** Fill opacity applied to all RLE mask pixels (0–1). */
  opacity: 0.45,
};

// ── Annotation line (open polyline, e.g. Centerline) ─────────────────────────

export const annotationLine = {
  /**
   * Fixed stroke width in pixels.
   * Set to 0 to auto-scale: computedWidth = max(minWidth, round(canvasWidth / autoScaleDivisor))
   */
  lineWidth: 4,

  /** Divisor for auto-scaling line width. */
  autoScaleDivisor: 320,

  /** Minimum stroke width when auto-scaling (px). */
  minWidth: 3,

  /** Stroke style: "solid" or "dashed". */
  style: "dashed" as "solid" | "dashed",

  /** Length of each dash in pixels (only used when style === "dashed"). */
  dashLength: 24,

  /** Length of each gap in pixels (only used when style === "dashed"). */
  gapLength: 8,

  /** Stroke opacity (0–1). */
  opacity: 1,

  /** Whether to draw a label badge at the line midpoint. */
  showLabel: true,

  /** Gradient area rendered around the line, similar to safe-zone area bands. */
  area: {
    /** Number of concentric band passes (0 = disabled). */
    bands: 6,
    /** Outer edge color (CSS hex). */
    outerColor: "#facc15",
    /** Total band thickness in pixels (outer edge width). */
    width: 480,
    /** Peak opacity of the innermost band. */
    opacity: 0.22,
  },
};

// ── Suture hint ────────────────────────────────────────────────────────────────

export const sutureHint = {
  /** Enable/disable suture hint rendering. */
  enabled: true,

  /** Label for the start suture point. */
  startLabel: "START",

  /** Label for the middle suture point. */
  middleLabel: "MID",

  /** Label for the end suture point. */
  endLabel: "END",

  /** Radius of the outer pulsing ring (px). */
  outerRingRadius: 45,

  /** Radius of the inner solid circle (px). */
  innerCircleRadius: 24,

  /** Color of the start point. */
  startColor: "#22c55e",    // Green

  /** Color of the middle point. */
  middleColor: "#eab308",   // Yellow

  /** Color of the end point. */
  endColor: "#ef4444",      // Red

  /** Opacity of the outer pulsing ring (0–1). */
  outerRingOpacity: 0.7,

  /** Background opacity of the label badge. */
  badgeBackgroundOpacity: 0.85,

  /** Font size of the label badge text (px). */
  badgeFontSize: 16,

  /** Whether to show the connecting line between suture points. */
  showConnectLine: true,

  /** Color of the connecting line. */
  connectLineColor: "#ffffff",

  /** Width of the connecting line (px). */
  connectLineWidth: 7,

  /** Opacity of the connecting line (0–1). */
  connectLineOpacity: 0.6,

  /** Pulse animation speed in Hz (cycles per second). */
  pulseHz: 1.5,

  /** Whether to show arrow indicators pointing to each suture point. */
  showArrows: true,
};
