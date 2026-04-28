import { ZoneFillStyle } from "./types";

/* ── Safe-zone defaults ── */
export const safeZoneLine = {
  /** Default line color */
  color: "#22c55e",
  /** Default line width (px) */
  width: 3,
  /** Default line opacity */
  opacity: 0.9,
  /** Default line style */
  style: "solid" as const,
  /** Dash pattern when style is "dashed" */
  dashLength: 16,
  gapLength: 24,
};

export const safeZoneArea = {
  /** Default area color (safe / inner) */
  color: "#22c55e",
  /** Outer edge color (less safe) */
  outerColor: "#facc15",
  /** Default area width — total thickness of the filled band around the line (px) */
  width: 48,
  /** Default area opacity */
  opacity: 0.18,
  /** Number of gradient bands rendered concentrically */
  bands: 4,
};

/* ── Hatch pattern config ── */
export const hatch = {
  /** Gap between hatch lines (px). Larger = more spacing. */
  spacing: 32,
  /** Thickness of each hatch line (px). */
  strokeWidth: 28,
  /** Rotation angle of the hatch lines (degrees). */
  angle: 45,
  /** Length of the hatch line (px). Should be >= spacing. */
  lineLength: 32,
  /** Extra opacity boost added to the zone's base opacity. */
  opacityBoost: 0.1,
};

/* ── Solid fill config ── */
export const solid = {
  /** Border stroke width (px). */
  strokeWidth: 1,
};

/* ── Outline config ── */
export const outline = {
  /** Border stroke width (px). */
  strokeWidth: 8,
};

/* ── Dashed config ── */
export const dashed = {
  /** Length of each dash (px). */
  dashLength: 24,
  /** Length of each gap (px). */
  gapLength: 8,
  /** Border stroke width (px). */
  strokeWidth: 8,
};

/* ── Edit-mode indicator ── */
export const editIndicator = {
  /** Dash pattern shown on the active zone while editing (hatch style only). */
  dashLength: 6,
  gapLength: 3,
  strokeWidth: 2,
};

/* ── Helpers used by SegmentationOverlay ── */

export function getHatchOpacity(baseOpacity: number): number {
  return Math.max(0.2, Math.min(1, baseOpacity + hatch.opacityBoost));
}

export function getFill(style: ZoneFillStyle, color: string, patternId: string): string {
  switch (style) {
    case "solid":
      return color;
    case "outline":
    case "dashed":
      return "none";
    default:
      return `url(#${patternId})`;
  }
}

export function getFillOpacity(style: ZoneFillStyle, opacity: number): number | undefined {
  return style === "solid" ? opacity : undefined;
}

export function getStroke(
  style: ZoneFillStyle,
  color: string,
  isActiveEdit: boolean,
): string {
  if (style === "hatch" && !isActiveEdit) return "none";
  return color;
}

export function getStrokeWidth(style: ZoneFillStyle, isActiveEdit: boolean): number {
  switch (style) {
    case "outline":
      return outline.strokeWidth;
    case "dashed":
      return dashed.strokeWidth;
    case "solid":
      return solid.strokeWidth;
    case "hatch":
      return isActiveEdit ? editIndicator.strokeWidth : 1;
    default:
      return 1;
  }
}

export function getStrokeDasharray(style: ZoneFillStyle, isActiveEdit: boolean): string {
  if (style === "dashed") return `${dashed.dashLength} ${dashed.gapLength}`;
  if (isActiveEdit && style === "hatch") return `${editIndicator.dashLength} ${editIndicator.gapLength}`;
  return "none";
}

/**
 * Returns the stroke opacity for a polygon.
 * For outline/dashed the stroke IS the visual, so it follows the zone opacity.
 * For hatch the hatch lines handle their own opacity via the pattern; the
 * edit-mode border stroke also follows opacity.
 * For solid the border is decorative — keep it at 0.8.
 */
export function getStrokeOpacity(
  style: ZoneFillStyle,
  opacity: number,
  isActiveEdit: boolean,
): number {
  switch (style) {
    case "outline":
    case "dashed":
      return opacity;
    case "hatch":
      return isActiveEdit ? opacity : 1; // no stroke when not editing
    default:
      return 0.8;
  }
}
