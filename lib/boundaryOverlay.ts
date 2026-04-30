import {
  boundaryLine,
  boundaryFill,
  overlayLabel,
  annotationLine,
  IGNORED_LABELS,
  TOOL_LABELS,
} from "./overlayConfig";
import { BoundaryAnimationManager } from "./BoundaryAnimationManager";
import { classifyZone } from "./ZoneFactory";
import { SafeZone, DangerZone, OtherZone, HiddenZone } from "./types";
import { parseHex, lerpRgb } from "./ImageTools";
import {
  getColor,
  setupCanvas,
  getOverlayFontSize,
  getLineWidth,
  drawLabelBadge,
  MASK_WIDTH,
  MASK_HEIGHT,
  type MaskColor,
} from "./ImageTools";

// Derive boundary colors directly from the class defaults so any change there
// is automatically reflected here.
const _safe = new SafeZone("", "");
const _danger = new DangerZone("", "");
const _other = new OtherZone("", "");
const _hidden = new HiddenZone("", "");
const CLASSIFIED_COLORS: Record<string, MaskColor> = {
  danger:  parseHex(_danger.color),
  safe:    parseHex(_safe.color),
  other:   parseHex(_other.color),
  unknown: parseHex(_hidden.color),
};

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
  if ("x" in points[0]) return [points as { x: number; y: number }[]];
  return points as { x: number; y: number }[][];
}

/** Returns the boundary stroke/fill colour for a zone based on its danger classification. */
function getBoundaryColor(label: string): MaskColor {
  return CLASSIFIED_COLORS[classifyZone(label)];
}

const ABBREVIATED_LABELS: Record<string, string> = {
  "Phrenic nerve": "PN",
  "Aortic root": "AR",
  "Auricles": "RA",
  "Right atrium": "RA",
  "Epicardial adipose tissue": "EAT",
  "Epicardial fat on aortic": "EF",
  "Incision line": "IL",
  "Centerline": "CL",
  "Pericardium": "PC",
  "Grasper": "GR",
  "Needle holders": "NH",
  "MV anterior annulus": "MAA",
  "MV posterior annulus": "MPA",
  "Anterior MV (A1)": "A1",
  "Anterior MV (A2)": "A2",
};

function getBoundaryDisplayLabel(label: string, abbreviate: boolean): string {
  if (!abbreviate) return label;
  if (ABBREVIATED_LABELS[label]) return ABBREVIATED_LABELS[label];
  const initials = label
    .replace(/[()]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials.slice(0, 4) || label;
}

function pathSmoothedPolygon(
  ctx: CanvasRenderingContext2D,
  poly: { x: number; y: number }[],
  width: number,
  height: number,
): void {
  ctx.beginPath();
  if (poly.length > 2) {
    const smoothed = poly.map((curr, i) => {
      const prev = poly[(i - 1 + poly.length) % poly.length];
      const next = poly[(i + 1) % poly.length];
      return {
        x: (curr.x * 0.75 + prev.x * 0.125 + next.x * 0.125) * (width - 1),
        y: (curr.y * 0.75 + prev.y * 0.125 + next.y * 0.125) * (height - 1),
      };
    });
    ctx.moveTo(smoothed[0].x, smoothed[0].y);
    for (let i = 1; i < smoothed.length; i++) {
      ctx.lineTo(smoothed[i].x, smoothed[i].y);
    }
  } else {
    ctx.moveTo(poly[0].x * (width - 1), poly[0].y * (height - 1));
    for (let i = 1; i < poly.length; i++) {
      ctx.lineTo(poly[i].x * (width - 1), poly[i].y * (height - 1));
    }
  }
  ctx.closePath();
}

export function renderBoundaryOverlay(
  canvas: HTMLCanvasElement,
  zones: BoundaryZone[],
  width = MASK_WIDTH,
  height = MASK_HEIGHT,
  animManager?: BoundaryAnimationManager,
  showSafeZones = false,
  showToolZones = false,
  abbreviateLabels = false,
): void {
  const ctx = setupCanvas(canvas, width, height);

  const visibleZones = zones
    .filter((z) => {
      const role = classifyZone(z.label);
      if (role !== "safe") return true;
      if (showSafeZones) return true;
      return showToolZones && TOOL_LABELS.has(z.label);
    })
    .filter((z) => !IGNORED_LABELS.has(z.label));

  const labelIndex = new Map<string, number>();
  let idx = 0;
  for (const z of visibleZones) {
    if (!labelIndex.has(z.label)) labelIndex.set(z.label, idx++);
  }

  const scale = width / 1920;
  const lineDash =
    boundaryLine.style === "dashed"
      ? [6 * scale, 8 * scale]
      : [];

  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (const zone of visibleZones) {
    const polygons = normalizePolygons(zone.points);
    const color = getBoundaryColor(zone.label);
    const role = classifyZone(zone.label);
    const zoneAlpha = animManager?.getHint(zone.label)?.opacity ?? 1;
    const fillOpacity = boundaryFill.opacity * (role === "safe" ? 0.85 : role === "danger" ? 1.15 : 1) * zoneAlpha;
    const glowOpacity = boundaryLine.opacity * (role === "safe" ? 0.88 : role === "danger" ? 1 : 0.92) * zoneAlpha;
    const glowWidth = (role === "danger" ? 4.2 : 3) * scale;
    const coreWidth = (role === "danger" ? 1.45 : 1.1) * scale;

    for (const poly of polygons) {
      if (poly.length < 2) continue;

      pathSmoothedPolygon(ctx, poly, width, height);
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = Math.min(1, fillOpacity);
      ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},1)`;
      ctx.fill();
      ctx.restore();

      pathSmoothedPolygon(ctx, poly, width, height);
      ctx.save();
      ctx.setLineDash(lineDash);
      ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},${Math.min(1, glowOpacity)})`;
      ctx.lineWidth = glowWidth;
      ctx.shadowColor = `rgba(${color.r},${color.g},${color.b},${Math.min(1, glowOpacity)})`;
      ctx.shadowBlur = 10 * scale * (role === "danger" ? 1.28 : 1);
      ctx.stroke();
      ctx.restore();

      pathSmoothedPolygon(ctx, poly, width, height);
      ctx.save();
      ctx.setLineDash(lineDash);
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.96, 0.72 * zoneAlpha)})`;
      ctx.lineWidth = coreWidth;
      ctx.stroke();
      ctx.restore();

      ctx.setLineDash([]);
    }
  }

  const fontSize = getOverlayFontSize(width);
  ctx.font = `${fontSize}px system-ui, sans-serif`;

  for (const zone of visibleZones) {
    const polygons = normalizePolygons(zone.points);
    const hint = animManager?.getHint(zone.label);
    const labelAlpha = hint?.labelOpacity ?? 1;
    const scale = 1;
    const offY = hint?.labelOffsetY ?? 0;
    let cx = 0, cy = 0, total = 0;
    for (const poly of polygons) {
      for (const p of poly) { cx += p.x; cy += p.y; total++; }
    }
    if (total < 3) continue;

    const rawX = (cx / total) * (width - 1);
    const rawY = (cy / total) * (height - 1) + offY;

    const smoothed = animManager
      ? animManager.smoothCentroid(zone.label, rawX, rawY)
      : { x: rawX, y: rawY };

    ctx.save();
    ctx.translate(smoothed.x - width * 0.015, smoothed.y + height * 0.04);
    ctx.scale(scale, scale);

    const displayLabel = getBoundaryDisplayLabel(zone.label, abbreviateLabels);
    const bh = fontSize + overlayLabel.paddingY * 2;
    drawLabelBadge(ctx, displayLabel, fontSize, labelAlpha);

    if (hint?.flashing) {
      const iconAlpha = hint.opacity;
      const svgH = 13;
      const scale2 = (bh / svgH) * 0.7;
      const gap = 8;
      const bw = ctx.measureText(displayLabel).width + overlayLabel.paddingX * 2;
      const cx2 = -bw / 2 - gap - 7 * scale2;

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
      ctx.lineWidth = 1 / scale2;
      ctx.stroke();

      ctx.fillStyle = `rgba(28,25,23,${iconAlpha})`;
      ctx.font = `bold 7px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("!", 0, 2);

      ctx.restore();

      ctx.font = `${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
    }

    ctx.restore();
  }
}

export function renderLinesOverlay(
  canvas: HTMLCanvasElement,
  lines: LineAnnotation[],
  width = MASK_WIDTH,
  height = MASK_HEIGHT,
  animManager?: BoundaryAnimationManager,
  abbreviateLabels = false,
): void {
  const ctx = setupCanvas(canvas, width, height);

  const labelIndex = new Map<string, number>();
  let idx = 0;
  for (const line of lines) {
    if (!labelIndex.has(line.label)) labelIndex.set(line.label, idx++);
  }

  const lineWidth = getLineWidth(annotationLine, width);
  const fontSize = getOverlayFontSize(width);
  const scale = width / 1920;

  ctx.lineJoin = "round";

  const lineDash =
    annotationLine.style === "dashed"
      ? [annotationLine.dashLength, annotationLine.gapLength]
      : [];

  for (const line of lines) {
    if (line.points.length < 2) continue;
    const color = getColor(line.label, labelIndex.get(line.label)!);

    const area = annotationLine.area;
    if (area.bands > 0 && area.width > 0) {
      const outerRgb = parseHex(area.outerColor);
      const bands = area.bands;
      ctx.setLineDash([]);
      ctx.lineCap = "round";
      for (let bi = 0; bi < bands; bi++) {
        const t = bands > 1 ? bi / (bands - 1) : 1;
        const w = area.width * (1 - t * 0.7);
        const bandColor = lerpRgb(outerRgb, color, t);
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
    ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},0.9)`;
    ctx.lineWidth = 5.5 * scale;
    ctx.shadowColor = `rgba(${color.r},${color.g},${color.b},0.95)`;
    ctx.shadowBlur = 10 * scale;
    ctx.beginPath();
    ctx.moveTo(line.points[0].x * (width - 1), line.points[0].y * (height - 1));
    for (let i = 1; i < line.points.length; i++) {
      ctx.lineTo(line.points[i].x * (width - 1), line.points[i].y * (height - 1));
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.setLineDash(lineDash);
    ctx.strokeStyle = `rgba(255,255,255,0.78)`;
    ctx.lineWidth = 2.35 * scale;
    ctx.beginPath();
    ctx.moveTo(line.points[0].x * (width - 1), line.points[0].y * (height - 1));
    for (let i = 1; i < line.points.length; i++) {
      ctx.lineTo(line.points[i].x * (width - 1), line.points[i].y * (height - 1));
    }
    ctx.stroke();
    ctx.setLineDash([]);

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
    ctx.save();
    ctx.translate(mx, my);
    drawLabelBadge(ctx, getBoundaryDisplayLabel(line.label, abbreviateLabels), fontSize);
    ctx.restore();
  }
}
