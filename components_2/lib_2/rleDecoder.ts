/** Client-side Label Studio brush-RLE decoder.
 *
 * Format (bit-stream):
 *   32-bit total RGBA values, 5-bit (wordSize-1), 4×4-bit rleSizes,
 *   then bit-packed RLE of RGBA pixel data.
 *  Alpha channel (every 4th value) indicates mask foreground.
 */
import {
  boundaryLine,
  boundaryFill,
  overlayLabel,
  segmentationMask,
  annotationLine,
  sutureHint,
} from "./overlayConfig";
import { classifyZone, BoundaryAnimationManager } from "./BoundaryAnimationManager";
import { SafeZone, DangerZone, OtherZone } from "./types";

/** Parse a CSS hex color string into an RGB triple. */
function hexToRgb(hex: string): LabelColor {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

// Derive boundary colors directly from the class defaults so any change there
// is automatically reflected here.
const _safe = new SafeZone("", "");
const _danger = new DangerZone("", "");
const _other = new OtherZone("", "");
const _tool = { color: "#3b82f6" }; // ToolZone color
const CLASSIFIED_COLORS: Record<string, LabelColor> = {
  danger:  hexToRgb(_danger.color),
  safe:    hexToRgb(_safe.color),
  other:   hexToRgb(_other.color),
  tool:    hexToRgb(_tool.color),
  unknown: { r: 180, g: 100, b: 255 },
};

export const MASK_WIDTH = 1920;
export const MASK_HEIGHT = 1080;

// ── Bit Stream Reader ─────────────────────────────────────────────────────────

class BitInputStream {
  private bytes: number[];
  private bitPos = 0;

  constructor(bytes: number[]) {
    this.bytes = bytes;
  }

  read(numBits: number): number {
    let value = 0;
    for (let i = 0; i < numBits; i++) {
      const byteIndex = this.bitPos >> 3;
      const bitIndex = 7 - (this.bitPos & 7);
      if (byteIndex < this.bytes.length) {
        value = (value << 1) | ((this.bytes[byteIndex] >> bitIndex) & 1);
      } else {
        value <<= 1;
      }
      this.bitPos++;
    }
    return value;
  }
}

// ── RLE Decoder ───────────────────────────────────────────────────────────────

export function decodeRLE(rle: number[]): Uint8Array {
  const input = new BitInputStream(rle);
  const num = input.read(32);
  const wordSize = input.read(5) + 1;
  const rleSizes: number[] = [];
  for (let k = 0; k < 4; k++) {
    rleSizes.push(input.read(4) + 1);
  }

  const out = new Uint8Array(num);
  let i = 0;
  while (i < num) {
    const x = input.read(1);
    const sizeIdx = input.read(2);
    const runLen = input.read(rleSizes[sizeIdx]);
    const j = i + 1 + runLen;
    if (x) {
      const val = input.read(wordSize);
      out.fill(val, i, Math.min(j, num));
      i = j;
    } else {
      const end = Math.min(j, num);
      while (i < end) {
        out[i] = input.read(wordSize);
        i++;
      }
    }
  }

  return out;
}

// ── Label colours ─────────────────────────────────────────────────────────────

export interface LabelColor {
  r: number;
  g: number;
  b: number;
}

const KNOWN_COLORS: Record<string, LabelColor> = {
  // High danger (red) - Critical anatomical structures
  "Phrenic nerve": { r: 239, g: 68, b: 68 },        // Red - High danger

  // Medium danger (orange) - Other anatomical structures
  "Epicardial adipose tissue": { r: 249, g: 115, b: 22 },  // Orange
  "Epicardial fat on aortic": { r: 251, g: 146, b: 60 },   // Light orange
  "Aortic root": { r: 249, g: 115, b: 22 },                // Orange - Other
  "Auricles": { r: 251, g: 146, b: 60 },                   // Light orange - Other

  // Safe (green) - Safe anatomical structures
  "Pericardium boundary": { r: 34, g: 197, b: 94 },        // Green - Safe

  // Tools (blue) - Surgical instruments
  "Grasper": { r: 59, g: 130, b: 246 },              // Blue - Tool
  "Needle holder": { r: 99, g: 102, b: 241 },        // Indigo - Tool variant

  // Pericardial stay sutures (purple)
  "Pericardial stay sutures": { r: 168, g: 85, b: 247 },  // Purple

  // Band (yellow)
  "Band": { r: 234, g: 179, b: 8 },                  // Yellow

  // Lines (cyan/teal)
  "Incision line": { r: 20, g: 184, b: 166 },        // Teal
  "Centerline": { r: 45, g: 212, b: 191 },           // Cyan
};

function lerpColor(a: LabelColor, b: LabelColor, t: number): LabelColor {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

const EXTRA_COLORS: LabelColor[] = [
  { r: 180, g: 100, b: 255 },
  { r: 255, g: 160, b: 50 },
  { r: 100, g: 255, b: 255 },
  { r: 255, g: 100, b: 200 },
];

export function getLabelColor(label: string, index: number): LabelColor {
  return KNOWN_COLORS[label] ?? EXTRA_COLORS[index % EXTRA_COLORS.length];
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface SegmentationTag {
  label: string;
  rle: number[];
}

export interface LabelInfo {
  label: string;
  color: LabelColor;
  cx: number;
  cy: number;
}

// ── Render all masks for one image onto a canvas ──────────────────────────────

export function renderSegmentationOverlay(
  canvas: HTMLCanvasElement,
  tags: SegmentationTag[],
  width = MASK_WIDTH,
  height = MASK_HEIGHT,
  opacity = segmentationMask.opacity,
): LabelInfo[] {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, width, height);

  const totalPixels = width * height;

  // Assign a stable colour index to each unique label (skip Foreground)
  const labelIndex = new Map<string, number>();
  let idx = 0;
  for (const tag of tags) {
    if (!labelIndex.has(tag.label) && tag.label !== "Foreground") {
      labelIndex.set(tag.label, idx++);
    }
  }

  // Union masks per label + accumulate centroid
  const perLabel = new Map<
    string,
    { mask: Uint8Array; sumX: number; sumY: number; count: number }
  >();
  for (const [label] of labelIndex) {
    perLabel.set(label, {
      mask: new Uint8Array(totalPixels),
      sumX: 0,
      sumY: 0,
      count: 0,
    });
  }

  for (const tag of tags) {
    if (tag.label === "Foreground") continue;
    const rgba = decodeRLE(tag.rle);
    if (rgba.length < totalPixels * 4) continue;

    const entry = perLabel.get(tag.label)!;
    for (let i = 0; i < totalPixels; i++) {
      if (rgba[i * 4 + 3] > 0 && !entry.mask[i]) {
        entry.mask[i] = 1;
        entry.sumX += i % width;
        entry.sumY += Math.floor(i / width);
        entry.count++;
      }
    }
  }

  // Paint pixel data
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  const alpha = Math.round(opacity * 255);

  for (const [label] of labelIndex) {
    const { mask } = perLabel.get(label)!;
    const color = getLabelColor(label, labelIndex.get(label)!);
    for (let i = 0; i < totalPixels; i++) {
      if (mask[i]) {
        const off = i * 4;
        data[off] = color.r;
        data[off + 1] = color.g;
        data[off + 2] = color.b;
        data[off + 3] = alpha;
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);

  // Collect label centroids
  const labels: LabelInfo[] = [];
  for (const [label] of labelIndex) {
    const entry = perLabel.get(label)!;
    if (entry.count === 0) continue;
    labels.push({
      label,
      color: getLabelColor(label, labelIndex.get(label)!),
      cx: entry.sumX / entry.count,
      cy: entry.sumY / entry.count,
    });
  }

  // Draw label badges
  const fontSize =
    overlayLabel.fontSize > 0
      ? overlayLabel.fontSize
      : Math.max(overlayLabel.minFontSize, Math.round(width / overlayLabel.autoScaleDivisor));
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const li of labels) {
    const m = ctx.measureText(li.label);
    const bw = m.width + overlayLabel.paddingX * 2;
    const bh = fontSize + overlayLabel.paddingY * 2;
    const x = li.cx - width * 0.015;
    const y = li.cy + height * 0.015;

    ctx.fillStyle = `rgba(0,0,0,${overlayLabel.backgroundOpacity})`;
    ctx.beginPath();
    ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, overlayLabel.borderRadius);
    ctx.fill();

    // Dashed colored border
    ctx.strokeStyle = `rgba(${li.color.r},${li.color.g},${li.color.b},0.8)`;
    ctx.lineWidth = overlayLabel.borderWidth;
    ctx.setLineDash(overlayLabel.borderDashed ? overlayLabel.borderDash : []);
    ctx.beginPath();
    ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, overlayLabel.borderRadius);
    ctx.stroke();
    ctx.setLineDash([]);

    // White label text for better contrast
    ctx.fillStyle = `rgb(255,255,255)`;
    ctx.fillText(li.label, x, y);
  }

  return labels;
}

// ── Boundary (polygon) overlay ────────────────────────────────────────────────

export interface BoundaryZone {
  label: string;
  points: { x: number; y: number }[][] | { x: number; y: number }[];
}

export interface LineAnnotation {
  label: string;
  points: { x: number; y: number }[];
}

export interface BoundaryRecord {
  image: string;
  zones: BoundaryZone[];
  lines?: LineAnnotation[];
}

/** Normalize points field to always be an array of polygons. */
function normalizePolygons(
  points: { x: number; y: number }[][] | { x: number; y: number }[],
): { x: number; y: number }[][] {
  if (points.length === 0) return [];
  // If the first element has x/y, it's a single flat polygon
  if ("x" in points[0]) return [points as { x: number; y: number }[]];
  return points as { x: number; y: number }[][];
}

/** Returns the boundary stroke/fill color for a zone label based on its category. */
function getBoundaryColor(label: string): LabelColor {
  return CLASSIFIED_COLORS[classifyZone(label)];
}

/**
 * @param animManager Optional BoundaryAnimationManager that provides per-label
 *   render hints (opacity, scale, etc.) and smoothed label positions.
 */
export function renderBoundaryOverlay(
  canvas: HTMLCanvasElement,
  zones: BoundaryZone[],
  width = MASK_WIDTH,
  height = MASK_HEIGHT,
  animManager?: BoundaryAnimationManager,
  showSafeZones = false,
  showToolLabels = false,
): void {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, width, height);

  const visibleZones = showSafeZones
    ? zones
    : zones.filter((z) => classifyZone(z.label) !== "safe");

  // Assign stable colour index (skip Foreground)
  const labelIndex = new Map<string, number>();
  let idx = 0;
  for (const z of visibleZones) {
    if (!labelIndex.has(z.label) && z.label !== "Foreground") {
      labelIndex.set(z.label, idx++);
    }
  }

  const lineWidth =
    boundaryLine.lineWidth > 0
      ? boundaryLine.lineWidth
      : Math.max(boundaryLine.minWidth, Math.round(width / boundaryLine.autoScaleDivisor));

  const lineDash =
    boundaryLine.style === "dashed"
      ? [boundaryLine.dashLength, boundaryLine.gapLength]
      : [];

  for (const zone of visibleZones) {
    if (zone.label === "Foreground") continue;
    // Skip rendering for tool zones unless explicitly enabled
    if (classifyZone(zone.label) === "tool" && !showToolLabels) continue;
    const polygons = normalizePolygons(zone.points);
    const color = getBoundaryColor(zone.label);
    const zoneAlpha = animManager?.getHint(zone.label)?.opacity ?? 1;

    for (const poly of polygons) {
      if (poly.length < 2) continue;

      ctx.beginPath();
      ctx.moveTo(poly[0].x * (width - 1), poly[0].y * (height - 1));
      for (let i = 1; i < poly.length; i++) {
        ctx.lineTo(poly[i].x * (width - 1), poly[i].y * (height - 1));
      }
      ctx.closePath();

      const category = classifyZone(zone.label);
      const fillOpacity =
        category === "danger" ? boundaryFill.dangerFillOpacity
        : category === "other"  ? boundaryFill.otherFillOpacity
        : boundaryFill.opacity;
      ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${fillOpacity * zoneAlpha})`;
      ctx.fill();

      ctx.setLineDash(lineDash);
      ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},${boundaryLine.opacity * zoneAlpha})`;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Labels at combined centroid of all polygons per zone
  const fontSize =
    overlayLabel.fontSize > 0
      ? overlayLabel.fontSize
      : Math.max(overlayLabel.minFontSize, Math.round(width / overlayLabel.autoScaleDivisor));
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const zone of visibleZones) {
    if (zone.label === "Foreground") continue;
    // Skip label rendering for tool zones unless explicitly enabled
    if (classifyZone(zone.label) === "tool" && !showToolLabels) continue;
    const polygons = normalizePolygons(zone.points);
    const hint = animManager?.getHint(zone.label);
    const labelAlpha = hint?.labelOpacity ?? 1;
    const scale = hint?.labelScale ?? 1;
    const offY = hint?.labelOffsetY ?? 0;
    let cx = 0, cy = 0, total = 0;
    for (const poly of polygons) {
      for (const p of poly) { cx += p.x; cy += p.y; total++; }
    }
    if (total < 3) continue;
    // Raw centroid in canvas coordinates
    const rawX = (cx / total) * (width - 1);
    const rawY = (cy / total) * (height - 1) + offY;

    // Smooth the label position through the manager
    const smoothed = animManager
      ? animManager.smoothCentroid(zone.label, rawX, rawY)
      : { x: rawX, y: rawY };

    // Apply scale transform around the smoothed label centre
    ctx.save();
    ctx.translate(smoothed.x - width * 0.015, smoothed.y + height * 0.04);
    ctx.scale(scale, scale);

    const m = ctx.measureText(zone.label);
    const bw = m.width + overlayLabel.paddingX * 2;
    const bh = fontSize + overlayLabel.paddingY * 2;

    ctx.fillStyle = `rgba(0,0,0,${overlayLabel.backgroundOpacity * labelAlpha})`;
    ctx.beginPath();
    ctx.roundRect(-bw / 2, -bh / 2, bw, bh, overlayLabel.borderRadius);
    ctx.fill();

    // Dashed colored border
    const bdrgb = getBoundaryColor(zone.label);
    ctx.strokeStyle = `rgba(${bdrgb.r},${bdrgb.g},${bdrgb.b},${0.8 * labelAlpha})`;
    ctx.lineWidth = overlayLabel.borderWidth;
    ctx.setLineDash(overlayLabel.borderDashed ? overlayLabel.borderDash : []);
    ctx.beginPath();
    ctx.roundRect(-bw / 2, -bh / 2, bw, bh, overlayLabel.borderRadius);
    ctx.stroke();
    ctx.setLineDash([]);

    // White label text (respect label alpha)
    ctx.fillStyle = `rgba(255,255,255,${labelAlpha})`;
    ctx.fillText(zone.label, 0, 0);

    // Warning icon — shown only while the boundary is flashing, blinks with it
    // Matches the SVG triangle in SegmentationOverlay: points="0,-8 7,5 -7,5"
    if (hint?.flashing) {
      const iconAlpha = hint.opacity;

      // Scale the SVG triangle (14×13 px at fontSize≈12) to match the canvas badge height
      const svgH = 13; // tip(-8) to base(+5) in SVG space
      // Slightly smaller than before so the triangle sits comfortably next to the badge
      const scale2 = (bh / svgH) * 0.7;

      // Triangle vertices in SVG space: tip at (0,-8), br at (7,5), bl at (-7,5)
      // Place centroid to the left of the badge with an 8px gap
      const gap = 8;
      const cx2 = -bw / 2 - gap - 7 * scale2; // 7 = half-width in SVG space

      ctx.save();
      ctx.translate(cx2, 0);
      ctx.scale(scale2, scale2);

      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(7, 5);
      ctx.lineTo(-7, 5);
      ctx.closePath();

      ctx.fillStyle = `rgba(250,204,21,${iconAlpha})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(146,64,14,${iconAlpha})`;
      ctx.lineWidth = 1 / scale2; // keep stroke visually ~1px
      ctx.stroke();

      // "!" glyph — fontSize=7, position y=2 to match SVG dominantBaseline=middle
      ctx.fillStyle = `rgba(28,25,23,${iconAlpha})`;
      ctx.font = `bold 7px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("!", 0, 2);

      ctx.restore();

      // Restore text settings for subsequent zones
      ctx.font = `${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
    }

    ctx.restore();
  }
}

// ── Line annotation overlay ───────────────────────────────────────────────────

/**
 * Renders open polylines (e.g. incision lines) onto a canvas.
 * Points are normalized 0–1 coordinates.
 */
export function renderLinesOverlay(
  canvas: HTMLCanvasElement,
  lines: LineAnnotation[],
  width = MASK_WIDTH,
  height = MASK_HEIGHT,
  animManager?: BoundaryAnimationManager,
): void {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, width, height);

  const labelIndex = new Map<string, number>();
  let idx = 0;
  for (const line of lines) {
    if (!labelIndex.has(line.label)) labelIndex.set(line.label, idx++);
  }

  const lineWidth =
    annotationLine.lineWidth > 0
      ? annotationLine.lineWidth
      : Math.max(annotationLine.minWidth, Math.round(width / annotationLine.autoScaleDivisor));
  const fontSize = Math.max(
    overlayLabel.minFontSize,
    Math.round(width / overlayLabel.autoScaleDivisor),
  );

  ctx.lineJoin = "round";

  const lineDash =
    annotationLine.style === "dashed"
      ? [annotationLine.dashLength, annotationLine.gapLength]
      : [];

  for (const line of lines) {
    if (line.points.length < 2) continue;
    const color = getLabelColor(line.label, labelIndex.get(line.label)!);

    // Area gradient bands (drawn beneath the main line)
    const area = annotationLine.area;
    if (area.bands > 0 && area.width > 0) {
      const outerRgb = hexToRgb(area.outerColor);
      const bands = area.bands;
      ctx.setLineDash([]);
      ctx.lineCap = "round";
      for (let bi = 0; bi < bands; bi++) {
        const t = bands > 1 ? bi / (bands - 1) : 1;
        const w = area.width * (1 - t * 0.7);
        const bandColor = lerpColor(outerRgb, color, t);
        const opacity = area.opacity * (0.4 + 0.6 * t);
        ctx.strokeStyle = `rgba(${bandColor.r},${bandColor.g},${bandColor.b},${opacity})`;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(line.points[0].x * (width - 1), line.points[0].y * (height - 1));
        for (let pi = 1; pi < line.points.length; pi++) {
          ctx.lineTo(line.points[pi].x * (width - 1), line.points[pi].y * (height - 1));
        }
        ctx.stroke();
      }
      ctx.lineCap = "butt";
    }

    ctx.setLineDash(lineDash);
    ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},${annotationLine.opacity})`;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(line.points[0].x * (width - 1), line.points[0].y * (height - 1));
    for (let i = 1; i < line.points.length; i++) {
      ctx.lineTo(line.points[i].x * (width - 1), line.points[i].y * (height - 1));
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Label badge at midpoint — styled like zone labels
    if (!annotationLine.showLabel) continue;
    const mid = line.points[Math.floor(line.points.length / 2)];
    const rawMx = mid.x * (width - 1) - width * 0.12;
    const rawMy = mid.y * (height - 1) + height * 0.04;
    const smoothed = animManager
      ? animManager.smoothCentroid(line.label, rawMx, rawMy)
      : { x: rawMx, y: rawMy };
    const mx = smoothed.x;
    const my = smoothed.y;
    ctx.font = `${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const m = ctx.measureText(line.label);
    const bw = m.width + overlayLabel.paddingX * 2;
    const bh = fontSize + overlayLabel.paddingY * 2;

    ctx.save();
    ctx.translate(mx, my);

    ctx.fillStyle = `rgba(0,0,0,${overlayLabel.backgroundOpacity})`;
    ctx.beginPath();
    ctx.roundRect(-bw / 2, -bh / 2, bw, bh, overlayLabel.borderRadius);
    ctx.fill();

    ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},0.8)`;
    ctx.lineWidth = overlayLabel.borderWidth;
    ctx.setLineDash(overlayLabel.borderDashed ? overlayLabel.borderDash : []);
    ctx.beginPath();
    ctx.roundRect(-bw / 2, -bh / 2, bw, bh, overlayLabel.borderRadius);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = `rgba(255,255,255,1)`;
    ctx.fillText(line.label, 0, 0);

    ctx.restore();
  }
}

// ── Suture hint rendering ──────────────────────────────────────────────────────

/** Three anchor points along the pericardium boundary path. */
export interface SutureAnchor {
  /** Normalized 0-1 coordinates. */
  x: number;
  y: number;
  /** Label displayed on the badge. */
  label: string;
  /** CSS hex color. */
  color: string;
  /** 0 = start, 1 = middle, 2 = end */
  index: number;
}

/**
 * Extract three anchor points (start / middle / end) from a SINGLE
 * Pericardium boundary frame.
 *
 * START = point with minimum x  (left-most on the polygon)
 * END   = point with maximum x  (right-most on the polygon)
 * MID   = centroid of all polygon points
 */
export function extractSutureAnchorsFromFrame(
  points: { x: number; y: number }[],
): SutureAnchor[] {
  if (!points || points.length === 0) return [];

  if (points.length === 1) {
    const p = points[0];
    return [
      { ...p, label: sutureHint.startLabel, color: sutureHint.startColor, index: 0 },
      { ...p, label: sutureHint.middleLabel, color: sutureHint.middleColor, index: 1 },
      { ...p, label: sutureHint.endLabel, color: sutureHint.endColor, index: 2 },
    ];
  }

  if (points.length === 2) {
    return [
      { ...points[0], label: sutureHint.startLabel, color: sutureHint.startColor, index: 0 },
      { ...points[0], label: sutureHint.middleLabel, color: sutureHint.middleColor, index: 1 },
      { ...points[1], label: sutureHint.endLabel, color: sutureHint.endColor, index: 2 },
    ];
  }

  const startPt = points.reduce((a, b) => (a.x <= b.x ? a : b));
  const endPt = points.reduce((a, b) => (a.x >= b.x ? a : b));

  const sum = points.reduce(
    (a, p) => ({ x: a.x + p.x, y: a.y + p.y }),
    { x: 0, y: 0 }
  );
  const midPt = { x: sum.x / points.length, y: sum.y / points.length };

  return [
    { ...startPt, label: sutureHint.startLabel, color: sutureHint.startColor, index: 0 },
    { ...midPt, label: sutureHint.middleLabel, color: sutureHint.middleColor, index: 1 },
    { ...endPt, label: sutureHint.endLabel, color: sutureHint.endColor, index: 2 },
  ];
}

/**
 * Renders animated suture hint markers on the canvas.
 *
 * The three anchor points are displayed as:
 *   1. A pulsing outer ring (animated opacity)
 *   2. A solid inner circle with a colored border
 *   3. A label badge below the circle
 *
 * A dashed connecting line is drawn between the points to show the suture path.
 *
 * @param canvas   Target canvas element.
 * @param anchors  Three SutureAnchor points.
 * @param width    Canvas width in pixels.
 * @param height   Canvas height in pixels.
 * @param time     Current video time in seconds (used for pulse animation).
 */
export function renderSutureHints(
  canvas: HTMLCanvasElement,
  anchors: SutureAnchor[],
  width = MASK_WIDTH,
  height = MASK_HEIGHT,
  time = 0,
): void {
  if (!sutureHint.enabled || anchors.length < 2) return;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, width, height);

  // Convert normalized coords to canvas pixels
  const pxAnchors = anchors.map((a) => ({
    ...a,
    px: a.x * (width - 1),
    py: a.y * (height - 1),
  }));

  // ── Connecting dashed line ───────────────────────────────────────────────
  if (sutureHint.showConnectLine && pxAnchors.length >= 2) {
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = `rgba(255,255,255,${sutureHint.connectLineOpacity})`;
    ctx.lineWidth = sutureHint.connectLineWidth;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pxAnchors[0].px, pxAnchors[0].py);
    for (let i = 1; i < pxAnchors.length; i++) {
      ctx.lineTo(pxAnchors[i].px, pxAnchors[i].py);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── Pulsing animation phase ──────────────────────────────────────────────
  const pulsePhase = (Math.sin(time * sutureHint.pulseHz * 2 * Math.PI) + 1) / 2; // 0..1

  // ── Draw each anchor ─────────────────────────────────────────────────────
  for (const anchor of pxAnchors) {
    const { px, py, color, label, index } = anchor;

    // Parse hex color
    const rgb = hexToRgb(color);

    // Outer pulsing ring
    const outerOpacity = sutureHint.outerRingOpacity * (0.4 + 0.6 * pulsePhase);
    const outerRadius = sutureHint.outerRingRadius * (1 + 0.15 * pulsePhase);

    ctx.beginPath();
    ctx.arc(px, py, outerRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${outerOpacity})`;
    ctx.lineWidth = 9;
    ctx.stroke();

    // Second outer ring (static, slightly larger)
    ctx.beginPath();
    ctx.arc(px, py, outerRadius + 12, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${outerOpacity * 0.4})`;
    ctx.lineWidth = 5;
    ctx.stroke();

    // Inner filled circle
    ctx.beginPath();
    ctx.arc(px, py, sutureHint.innerCircleRadius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.9)`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,0.9)`;
    ctx.lineWidth = 6;
    ctx.stroke();

    // White crosshair inside circle
    const crossSize = 9;
    ctx.strokeStyle = `rgba(255,255,255,0.8)`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(px - crossSize, py);
    ctx.lineTo(px + crossSize, py);
    ctx.moveTo(px, py - crossSize);
    ctx.lineTo(px, py + crossSize);
    ctx.stroke();

    // Arrow indicator pointing to the point
    if (sutureHint.showArrows) {
      drawArrowToPoint(ctx, px, py, color, index, pxAnchors, width, height);
    }

    // Label badge
    const fontSize = sutureHint.badgeFontSize;
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const textMetrics = ctx.measureText(label);
    const badgeW = textMetrics.width + 18;
    const badgeH = fontSize + 6;
    const badgeY = py + sutureHint.outerRingRadius + 20;

    // Badge shadow
    ctx.fillStyle = `rgba(0,0,0,0.4)`;
    ctx.beginPath();
    ctx.roundRect(px - badgeW / 2 + 3, badgeY - badgeH / 2 + 3, badgeW, badgeH, 4);
    ctx.fill();

    // Badge background
    ctx.fillStyle = `rgba(0,0,0,${sutureHint.badgeBackgroundOpacity})`;
    ctx.beginPath();
    ctx.roundRect(px - badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, 4);
    ctx.fill();

    // Badge colored left stripe
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(px - badgeW / 2, badgeY - badgeH / 2, 4, badgeH, [4, 0, 0, 4]);
    ctx.fill();

    // Badge text
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, px, badgeY);
  }
}

/** Draw a small arrow badge pointing toward each suture point. */
function drawArrowToPoint(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  color: string,
  index: number,
  allAnchors: Array<{ px: number; py: number; color: string; label: string; index: number }>,
  width: number,
  height: number,
): void {
  const arrowSize = 15;
  const rgb = hexToRgb(color);

  // Determine arrow direction: point toward the center of the canvas
  const centerX = width / 2;
  const centerY = height / 2;
  const dx = centerX - px;
  const dy = centerY - py;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 1) return;

  // Normalize direction
  const nx = dx / dist;
  const ny = dy / dist;

  // Arrow position: offset from the circle toward center
  const arrowDist = sutureHint.innerCircleRadius + 18;
  const ax = px + nx * arrowDist;
  const ay = py + ny * arrowDist;

  // Perpendicular for arrow head
  const perpX = -ny;
  const perpY = nx;

  // Arrow points
  const tipX = ax + nx * arrowSize;
  const tipY = ay + ny * arrowSize;
  const baseLeftX = ax - perpX * (arrowSize * 0.5);
  const baseLeftY = ay - perpY * (arrowSize * 0.5);
  const baseRightX = ax + perpX * (arrowSize * 0.5);
  const baseRightY = ay + perpY * (arrowSize * 0.5);

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseLeftX, baseLeftY);
  ctx.lineTo(baseRightX, baseRightY);
  ctx.closePath();
  ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.85)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(255,255,255,0.6)`;
  ctx.lineWidth = 3;
  ctx.stroke();
}
