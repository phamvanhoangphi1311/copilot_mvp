#!/usr/bin/env node
/**
 * new_boundary_overlay_video.js
 *
 * Renders boundary (polygon) overlays from labels_points.json onto each frame
 * image and outputs an MP4 video using ffmpeg.
 *
 * Output: <projectDir>/footage_boundary.mp4
 *
 * Reads zone styling from the native overlayConfig.ts values by embedding
 * the same configuration directly, so changes in overlayConfig.ts are NOT
 * automatically reflected here — keep this script in sync with the
 * overlayConfig.ts defaults you want to use.
 *
 * Requires:
 *   npm install @napi-rs/canvas
 *   ffmpeg on PATH
 *
 * Usage:
 *   node scripts/new_boundary_overlay_video.js [projectDir] [--fps=N] [--start=N] [--end=N]
 *         [--labels=on|off] [--safe=on|off] [--lines=on|off] [--boundary=on|off]
 *         [--suture=on|off]
 *
 * Defaults:
 *   projectDir → D:\Projects\Features\Feature_2
 *   fps        → 18
 *   start      → 0
 *   end        → (last frame)
 *   labels     → on
 *   safe       → on
 *   lines      → on
 *   boundary   → on
 *   suture     → on
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ── Load canvas dynamically ────────────────────────────────────────────────────
let Canvas, loadImage;
try {
  ({ Canvas, loadImage } = require("@napi-rs/canvas"));
} catch {
  console.error(
    "Error: The '@napi-rs/canvas' package is required.\n" +
    "Run: npm install @napi-rs/canvas\n" +
    "Then re-run this script."
  );
  process.exit(1);
}

// ── Zone classification (mirrors BoundaryAnimationManager.ts) ──────────────────

const DANGER_LABELS = new Set(["Phrenic nerve"]);
const SAFE_LABELS   = new Set(["Pericardium boundary"]);
const OTHER_LABELS  = new Set([
  "Aortic root",
  "Auricles",
  "Epicardial adipose tissue",
  "Epicardial fat on aortic",
]);
const TOOL_LABELS   = new Set(["Grasper", "Needle holder", "Needle holders"]);

function classifyZone(label) {
  if (DANGER_LABELS.has(label)) return "danger";
  if (SAFE_LABELS.has(label))   return "safe";
  if (OTHER_LABELS.has(label))  return "other";
  if (TOOL_LABELS.has(label))   return "tool";
  return "unknown";
}

// ── Zone colours (mirrors rleDecoder.ts CLASSIFIED_COLORS) ────────────────────

const COLORS = {
  danger:  { r: 239, g: 68,  b: 68  }, // #ef4444
  safe:    { r: 34,  g: 197, b: 94  }, // #22c55e
  other:   { r: 249, g: 115, b: 22  }, // #f97316
  tool:    { r: 59,  g: 130, b: 246  }, // #3b82f6
  unknown: { r: 180, g: 100, b: 255  }, // violet
};

// ── Overlay configuration (mirrors overlayConfig.ts) ───────────────────────────
// These values match the defaults in overlayConfig.ts — edit here if you want
// a different look for the exported video.

const CFG = {
  boundaryLine: {
    lineWidth: 4,
    style: "dashed",
    dashLength: 8,
    gapLength: 8,
    opacity: 1,
  },
  boundaryFill: {
    opacity: 0.2,
    dangerFillOpacity: 0.55,
    safeFillOpacity:   0.35,
    otherFillOpacity:  0.35,
  },
  overlayLabel: {
    fontSize: 0,          // 0 = auto-scale
    autoScaleDivisor: 110,
    minFontSize: 14,
    paddingX: 8,
    paddingY: 5,
    borderRadius: 4,
    backgroundOpacity: 0.75,
    borderWidth: 1.5,
    borderDashed: true,
    borderDash: [4, 3],
  },
  annotationLine: {
    lineWidth: 4,
    style: "dashed",
    dashLength: 24,
    gapLength: 8,
    opacity: 1,
    showLabel: true,
    area: {
      bands: 6,
      outerColor: "#facc15",
      width: 480,
      opacity: 0.22,
    },
  },
  sutureHint: {
    enabled: true,
    startLabel: "START",
    middleLabel: "MID",
    endLabel: "END",
    outerRingRadius: 45,
    innerCircleRadius: 24,
    startColor: "#22c55e",
    middleColor: "#22c55e",
    endColor: "#22c55e",
    outerRingOpacity: 0.7,
    badgeBackgroundOpacity: 0.85,
    badgeFontSize: 14,
    showConnectLine: true,
    connectLineColor: "#ffffff",
    connectLineWidth: 7,
    connectLineOpacity: 0.6,
    pulseHz: 1.5,
    showArrows: true,
  },
};

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {};
const positional = [];
for (const a of args) {
  const m = a.match(/^--(\w+)=(.+)$/);
  if (m) flags[m[1]] = m[2];
  else if (!a.startsWith("--")) positional.push(a);
}

const projectDir   = path.resolve(positional[0] ?? "D:\\Projects\\Features\\Feature_2");
const fps          = parseInt(flags.fps    ?? "18", 10);
const startFrame   = flags.start !== undefined ? parseInt(flags.start, 10) : null;
const endFrame     = flags.end   !== undefined ? parseInt(flags.end,   10) : null;
const showLabels   = flags.labels   !== "off";
const showBoundary = flags.boundary !== "off";
const showSafe     = flags.safe     !== "off";
const showLines    = flags.lines    !== "off";
const showSuture   = flags.suture   !== "off";
const showTools    = flags.tools    !== "off";

// ── Validate inputs ────────────────────────────────────────────────────────────

if (!fs.existsSync(projectDir)) {
  console.error(`Error: directory not found: ${projectDir}`);
  process.exit(1);
}

try {
  execSync("ffmpeg -version", { stdio: "ignore" });
} catch {
  console.error(
    "Error: ffmpeg not found. Install from https://ffmpeg.org/download.html and add to PATH."
  );
  process.exit(1);
}

// ── Load labels_points.json ─────────────────────────────────────────────────────

const labelsPath = path.join(projectDir, "labels_points.json");
if (!fs.existsSync(labelsPath)) {
  console.error(`Error: labels_points.json not found in ${projectDir}`);
  process.exit(1);
}

const labelsData = JSON.parse(fs.readFileSync(labelsPath, "utf8"));
console.log(`Loaded ${labelsData.length} frame record(s) from labels_points.json`);

// Build a lookup: image filename → zones + lines
const labelMap = new Map();
for (const rec of labelsData) {
  labelMap.set(rec.image, rec);
}

// ── Collect frame files ────────────────────────────────────────────────────────

const framesDir = path.join(projectDir, "frames");
if (!fs.existsSync(framesDir)) {
  console.error(`Error: frames/ folder not found in ${projectDir}`);
  process.exit(1);
}

const framePattern = /^frame_\d+\.(png|jpg|jpeg)$/i;
let frameFiles = fs.readdirSync(framesDir)
  .filter((f) => framePattern.test(f))
  .sort();

if (startFrame !== null || endFrame !== null) {
  frameFiles = frameFiles.slice(startFrame ?? 0, endFrame !== null ? endFrame + 1 : undefined);
}

if (frameFiles.length === 0) {
  console.error("Error: no matching frames found.");
  process.exit(1);
}

const total = frameFiles.length;
console.log(`Frames  : ${total} (${startFrame ?? 0} → ${endFrame ?? total - 1})`);
console.log(`FPS     : ${fps}`);
console.log(`Boundary: ${showBoundary ? "on" : "off"}`);
console.log(`Safe    : ${showSafe ? "on" : "off"}`);
console.log(`Labels  : ${showLabels ? "on" : "off"}`);
console.log(`Lines   : ${showLines ? "on" : "off"}`);
console.log(`Suture  : ${showSuture ? "on" : "off"}`);
console.log(`Tools   : ${showTools ? "on" : "off"}`);
console.log();

// ── Rendering helpers ───────────────────────────────────────────────────────────

/**
 * Compute the centroid of a flat polygon in canvas pixel coordinates.
 */
function polygonCentroid(polygon, w, h) {
  let cx = 0, cy = 0;
  for (const { x, y } of polygon) { cx += x * (w - 1); cy += y * (h - 1); }
  return { x: cx / polygon.length, y: cy / polygon.length };
}

/**
 * Combined centroid of all polygons in a zone (for label placement).
 */
function zoneCentroid(zone, w, h) {
  let cx = 0, cy = 0, total = 0;
  for (const poly of zone.points) {
    for (const p of poly) { cx += p.x; cy += p.y; total++; }
  }
  if (total === 0) return { x: w / 2, y: h / 2 };
  return { x: (cx / total) * (w - 1), y: (cy / total) * (h - 1) };
}

/**
 * Build a polygon path on the canvas context.
 * Accepts both flat polygon arrays and nested polygon arrays (polyline path).
 */
function buildPolygonPath(ctx, polygons, w, h) {
  ctx.beginPath();
  for (const poly of polygons) {
    if (poly.length < 2) continue;
    ctx.moveTo(poly[0].x * (w - 1), poly[0].y * (h - 1));
    for (let i = 1; i < poly.length; i++) {
      ctx.lineTo(poly[i].x * (w - 1), poly[i].y * (h - 1));
    }
    ctx.closePath();
  }
}

/**
 * Build a smoothed polygon path (mirrors rleDecoder.ts buildSmoothedPolygonPath).
 * Applies a 3-point smoothing via Catmull-Rom-like weights.
 */
function buildSmoothedPolygonPath(ctx, polygon, w, h) {
  if (polygon.length < 2) {
    ctx.beginPath();
    return;
  }
  if (polygon.length === 2) {
    ctx.beginPath();
    ctx.moveTo(polygon[0].x * (w - 1), polygon[0].y * (h - 1));
    ctx.lineTo(polygon[1].x * (w - 1), polygon[1].y * (h - 1));
    return;
  }
  ctx.beginPath();
  const smoothed = polygon.map((curr, index) => {
    const prev = polygon[(index - 1 + polygon.length) % polygon.length];
    const next = polygon[(index + 1) % polygon.length];
    return {
      x: (curr.x * 0.75 + prev.x * 0.125 + next.x * 0.125) * (w - 1),
      y: (curr.y * 0.75 + prev.y * 0.125 + next.y * 0.125) * (h - 1),
    };
  });
  ctx.moveTo(smoothed[0].x, smoothed[0].y);
  for (let i = 1; i < smoothed.length; i++) {
    ctx.lineTo(smoothed[i].x, smoothed[i].y);
  }
  ctx.closePath();
}

/**
 * Fill opacity per zone category (mirrors rleDecoder.ts fillOpacity logic).
 */
function getFillOpacity(category) {
  if (category === "danger")  return Math.max(0.3,  CFG.boundaryFill.dangerFillOpacity);
  if (category === "safe")    return Math.max(0.22, CFG.boundaryFill.safeFillOpacity);
  if (category === "other")   return Math.max(0.22, CFG.boundaryFill.otherFillOpacity);
  if (category === "tool")    return 0.18;
  return CFG.boundaryFill.opacity;
}

/**
 * Outer stroke line width per zone category.
 * Includes the Aortic root "target" override.
 */
function getOuterWidth(category, isTarget, renderScale) {
  if (isTarget)         return 5.5  * renderScale;
  if (category === "danger") return 4.2 * renderScale;
  return 3 * renderScale;
}

/**
 * Inner (white core) stroke line width per zone category.
 */
function getCoreWidth(category, isTarget, renderScale) {
  if (isTarget)               return 2.35 * renderScale;
  if (category === "danger")  return 1.45 * renderScale;
  return 1.1 * renderScale;
}

/**
 * Shadow blur scale factor per zone category.
 */
function getShadowFactor(category, isTarget) {
  if (isTarget)               return 1.75;
  if (category === "danger")  return 1.28;
  return 1;
}

/**
 * Abbreviate zone labels for badge display.
 * Mirrors rleDecoder.ts SHORT_LABELS.
 */
const SHORT_LABELS = {
  "Phrenic nerve":             "PN",
  "Aortic root":               "AR",
  "Auricles":                  "AUC",
  "Epicardial adipose tissue": "EAT",
  "Epicardial fat on aortic": "EF",
  "Pericardium boundary":      "PB",
  "Pericardium":               "PB",
  "Grasper":                   "GR",
  "Needle holder":             "NH",
  "Needle holders":            "NH",
  "Safe zone":                 "SZ",
  "Right atrium":              "RA",
  "Left atrium":               "LA",
  "Right ventricle":           "RV",
  "Left ventricle":            "LV",
  "SVC":                       "SVC",
  "IVC":                       "IVC",
  "Pulmonary artery":          "PA",
  "Pulmonary vein":            "PV",
  "Coronary artery":           "CA",
  "Mitral valve":              "MV",
  "Tricuspid valve":           "TV",
  "Aortic valve":              "AV",
  "Fossa ovalis":              "FO",
  "Epicardial":                "EPI",
};

function getDisplayLabel(label, abbreviate) {
  if (abbreviate) return SHORT_LABELS[label] ?? label.slice(0, 4);
  return label;
}

/**
 * Extract three suture anchors (START / MID / END) from a pericardium polygon.
 * START = left-most point, END = right-most point, MID = centroid.
 */
function extractSutureAnchors(points) {
  if (!points || points.length === 0) return [];
  if (points.length === 1) {
    const p = points[0];
    return [
      { ...p, label: CFG.sutureHint.startLabel,  color: CFG.sutureHint.startColor,  index: 0 },
      { ...p, label: CFG.sutureHint.middleLabel, color: CFG.sutureHint.middleColor, index: 1 },
      { ...p, label: CFG.sutureHint.endLabel,    color: CFG.sutureHint.endColor,    index: 2 },
    ];
  }
  if (points.length === 2) {
    return [
      { ...points[0], label: CFG.sutureHint.startLabel,  color: CFG.sutureHint.startColor,  index: 0 },
      { ...points[0], label: CFG.sutureHint.middleLabel, color: CFG.sutureHint.middleColor, index: 1 },
      { ...points[0], label: CFG.sutureHint.endLabel,    color: CFG.sutureHint.endColor,    index: 2 },
    ];
  }
  const startPt = points.reduce((a, b) => (a.x <= b.x ? a : b));
  const endPt   = points.reduce((a, b) => (a.x >= b.x ? a : b));
  const sum     = points.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
  const midPt   = { x: sum.x / points.length, y: sum.y / points.length };
  return [
    { ...startPt, label: CFG.sutureHint.startLabel,  color: CFG.sutureHint.startColor,  index: 0 },
    { ...midPt,   label: CFG.sutureHint.middleLabel, color: CFG.sutureHint.middleColor, index: 1 },
    { ...endPt,   label: CFG.sutureHint.endLabel,    color: CFG.sutureHint.endColor,    index: 2 },
  ];
}

/**
 * Parse a CSS hex color string into an RGB triple.
 */
function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

// ── Per-frame render ───────────────────────────────────────────────────────────

async function main() {
  const tmpDir = path.join(projectDir, "_boundary_frames");
  fs.mkdirSync(tmpDir, { recursive: true });

  let rendered = 0;

  for (const frameFile of frameFiles) {
    const framePath = path.join(framesDir, frameFile);
    const tmpPath   = path.join(tmpDir, frameFile);

    // Load the base frame image
    const img = await loadImage(fs.readFileSync(framePath));
    const w   = img.width;
    const h   = img.height;

    const canvas = new Canvas(w, h);
    const ctx    = canvas.getContext("2d");

    // 1. Draw the base frame
    ctx.drawImage(img, 0, 0);

    // 2. Load overlay data for this frame
    const frameData = labelMap.get(frameFile);
    if (!frameData) {
      const pngBuffer = await canvas.encode("png");
      fs.writeFileSync(tmpPath, pngBuffer);
      rendered++;
      process.stdout.write(`\r  Rendering frame ${rendered}/${total}…`);
      continue;
    }

    const zones = (frameData.zones || []).filter((z) => z.label !== "Foreground");
    const lines = frameData.lines || [];

    // Filter safe zones and tool zones if flags are off
    const visibleZones = zones.filter((z) => {
      const cat = classifyZone(z.label);
      if (!showSafe  && cat === "safe") return false;
      if (!showTools && cat === "tool") return false;
      return true;
    });

    const renderScale = w / 1920;
    const dash = [6 * renderScale, 8 * renderScale];

    ctx.lineJoin = "round";
    ctx.lineCap  = "round";

    // ── Draw boundary overlays ──────────────────────────────────────────────
    if (showBoundary) {
      for (const zone of visibleZones) {
        const category  = classifyZone(zone.label);
        const isTarget  = zone.label === "Aortic root";
        const color     = COLORS[category] ?? COLORS.unknown;
        const fillOpacity  = getFillOpacity(category);
        const outerWidth   = getOuterWidth(category, isTarget, renderScale);
        const coreWidth    = getCoreWidth(category, isTarget, renderScale);
        const shadowFactor = getShadowFactor(category, isTarget);

        for (const polygon of zone.points) {
          if (polygon.length < 2) continue;

          // — Fill ──────────────────────────────────────────────────────────
          buildSmoothedPolygonPath(ctx, polygon, w, h);
          ctx.save();
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = fillOpacity;
          ctx.fillStyle   = `rgb(${color.r},${color.g},${color.b})`;
          ctx.fill();
          ctx.restore();

          // — Outer dashed coloured stroke ──────────────────────────────────
          buildSmoothedPolygonPath(ctx, polygon, w, h);
          ctx.save();
          ctx.setLineDash(dash);
          ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},0.95)`;
          ctx.lineWidth    = outerWidth;
          ctx.shadowColor  = `rgba(${color.r},${color.g},${color.b},0.8)`;
          ctx.shadowBlur   = 10 * renderScale * shadowFactor;
          ctx.stroke();
          ctx.restore();

          // — Inner white core stroke ───────────────────────────────────────
          buildSmoothedPolygonPath(ctx, polygon, w, h);
          ctx.save();
          ctx.setLineDash(dash);
          ctx.strokeStyle = `rgba(255,255,255,${category === "danger" ? 0.9 : 0.78})`;
          ctx.lineWidth   = coreWidth;
          ctx.shadowBlur  = 0;
          ctx.stroke();
          ctx.restore();

          ctx.setLineDash([]);
        }
      }

      // ── Draw line annotations ────────────────────────────────────────────
      if (showLines && lines.length > 0) {
        const area = CFG.annotationLine.area;
        const lineDash = CFG.annotationLine.style === "dashed"
          ? [CFG.annotationLine.dashLength * renderScale, CFG.annotationLine.gapLength * renderScale]
          : [];

        for (const line of lines) {
          if (!line.points || line.points.length < 2) continue;

          // Determine colour from label
          const lineColorKey = line.label === "Incision line" ? "teal"
            : line.label === "Centerline" ? "cyan" : "yellow";
          const lineColors = {
            teal:  { r: 20,  g: 184, b: 166 },
            cyan:  { r: 45,  g: 212, b: 191 },
            yellow:{ r: 234, g: 179, b: 8   },
          };
          const color = lineColors[lineColorKey] ?? lineColors.yellow;

          // — Area gradient bands (mirrors rleDecoder.ts renderLinesOverlay) ─
          if (area.bands > 0 && area.width > 0) {
            const outerRgb = hexToRgb(area.outerColor);
            const bands = area.bands;
            ctx.setLineDash([]);
            ctx.lineCap = "round";
            for (let bi = 0; bi < bands; bi++) {
              const t  = bands > 1 ? bi / (bands - 1) : 1;
              const bandW = area.width * (1 - t * 0.7) * renderScale;
              // Lerp from outerColor toward line color
              const bandColor = {
                r: Math.round(outerRgb.r + (color.r - outerRgb.r) * t),
                g: Math.round(outerRgb.g + (color.g - outerRgb.g) * t),
                b: Math.round(outerRgb.b + (color.b - outerRgb.b) * t),
              };
              const opacity = area.opacity * (0.4 + 0.6 * t);
              ctx.strokeStyle = `rgba(${bandColor.r},${bandColor.g},${bandColor.b},${opacity})`;
              ctx.lineWidth   = bandW;
              ctx.beginPath();
              ctx.moveTo(line.points[0].x * (w - 1), line.points[0].y * (h - 1));
              for (let pi = 1; pi < line.points.length; pi++) {
                ctx.lineTo(line.points[pi].x * (w - 1), line.points[pi].y * (h - 1));
              }
              ctx.stroke();
            }
            ctx.lineCap = "butt";
          }

          // — Main dashed line ───────────────────────────────────────────────
          ctx.setLineDash(lineDash);
          ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},${CFG.annotationLine.opacity})`;
          ctx.lineWidth   = Math.max(2.35 * renderScale, CFG.annotationLine.lineWidth * 0.55 * renderScale);
          ctx.shadowColor = `rgba(${color.r},${color.g},${color.b},0.95)`;
          ctx.shadowBlur  = 10 * renderScale;
          ctx.beginPath();
          ctx.moveTo(line.points[0].x * (w - 1), line.points[0].y * (h - 1));
          for (let i = 1; i < line.points.length; i++) {
            ctx.lineTo(line.points[i].x * (w - 1), line.points[i].y * (h - 1));
          }
          ctx.stroke();
          ctx.shadowBlur  = 0;
          ctx.setLineDash([]);

          // — Line label badge ────────────────────────────────────────────────
          if (CFG.annotationLine.showLabel) {
            const mid = line.points[Math.floor(line.points.length / 2)];
            const mx  = mid.x * (w - 1) - w * 0.12;
            const my  = mid.y * (h - 1) + h * 0.04;
            const displayLabel = getDisplayLabel(line.label, false);
            const fontSize     = Math.max(CFG.overlayLabel.minFontSize, Math.round(w / 110));
            ctx.font         = `bold ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
            ctx.textAlign    = "center";
            ctx.textBaseline = "middle";
            const m   = ctx.measureText(displayLabel);
            const bw  = m.width + CFG.overlayLabel.paddingX * 2;
            const bh  = fontSize + CFG.overlayLabel.paddingY * 2;

            ctx.save();
            ctx.translate(mx, my);
            ctx.fillStyle = `rgba(0,0,0,0.9)`;
            ctx.beginPath();
            ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 3);
            ctx.fill();
            ctx.fillStyle = `rgba(255,255,255,1)`;
            ctx.fillText(displayLabel, 0, 0);
            ctx.restore();
          }
        }
      }

      // ── Draw suture hints on Pericardium boundary ─────────────────────────
      if (showSuture && CFG.sutureHint.enabled) {
        const pericardium = zones.find(
          (z) => z.label === "Pericardium boundary" || z.label === "Pericardium"
        );
        if (pericardium && pericardium.points && pericardium.points.length > 0) {
          // Use the largest (first) polygon for anchor extraction
          const mainPoly = pericardium.points.reduce(
            (a, b) => (b.length > a.length ? b : a)
          );
          const anchors = extractSutureAnchors(mainPoly);
          if (anchors.length > 0) {
            // Use a static time for the exported video (no real-time pulse)
            const pulsePhase = 0.5; // mid-pulse for a clear snapshot
            const sh = CFG.sutureHint;

            // — Connecting dashed line between anchors ──────────────────────
            if (sh.showConnectLine && anchors.length >= 2) {
              ctx.save();
              ctx.setLineDash([8, 6]);
              ctx.strokeStyle = `rgba(255,255,255,${sh.connectLineOpacity})`;
              ctx.lineWidth   = sh.connectLineWidth;
              ctx.lineCap     = "round";
              ctx.beginPath();
              const p0 = anchors[0];
              ctx.moveTo(p0.x * (w - 1), p0.y * (h - 1));
              for (let i = 1; i < anchors.length; i++) {
                const p = anchors[i];
                ctx.lineTo(p.x * (w - 1), p.y * (h - 1));
              }
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.restore();
            }

            // — Draw each anchor ──────────────────────────────────────────────
            for (const anchor of anchors) {
              const { x, y, color, label } = anchor;
              const px = x * (w - 1);
              const py = y * (h - 1);
              const rgb = hexToRgb(color);

              // Outer pulsing ring
              const outerOpacity = sh.outerRingOpacity * (0.4 + 0.6 * pulsePhase);
              const outerRadius  = sh.outerRingRadius * (1 + 0.15 * pulsePhase);

              ctx.beginPath();
              ctx.arc(px, py, outerRadius, 0, Math.PI * 2);
              ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${outerOpacity})`;
              ctx.lineWidth   = 9;
              ctx.stroke();

              // Second outer ring (static, slightly larger)
              ctx.beginPath();
              ctx.arc(px, py, outerRadius + 12, 0, Math.PI * 2);
              ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${outerOpacity * 0.4})`;
              ctx.lineWidth   = 5;
              ctx.stroke();

              // Inner filled circle
              ctx.beginPath();
              ctx.arc(px, py, sh.innerCircleRadius, 0, Math.PI * 2);
              ctx.fillStyle   = `rgba(${rgb.r},${rgb.g},${rgb.b},0.9)`;
              ctx.fill();
              ctx.strokeStyle = `rgba(255,255,255,0.9)`;
              ctx.lineWidth   = 6;
              ctx.stroke();

              // White crosshair inside circle
              const crossSize = 9;
              ctx.strokeStyle = `rgba(255,255,255,0.8)`;
              ctx.lineWidth   = 4;
              ctx.beginPath();
              ctx.moveTo(px - crossSize, py);
              ctx.lineTo(px + crossSize, py);
              ctx.moveTo(px, py - crossSize);
              ctx.lineTo(px, py + crossSize);
              ctx.stroke();

              // Arrow pointing toward canvas center
              if (sh.showArrows) {
                const centerX = w / 2;
                const centerY = h / 2;
                const dx   = centerX - px;
                const dy   = centerY - py;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist >= 1) {
                  const nx = dx / dist;
                  const ny = dy / dist;
                  const arrowSize  = 15;
                  const arrowDist  = sh.innerCircleRadius + 18;
                  const ax = px + nx * arrowDist;
                  const ay = py + ny * arrowDist;
                  const perpX = -ny;
                  const perpY = nx;
                  const tipX  = ax + nx * arrowSize;
                  const tipY  = ay + ny * arrowSize;
                  ctx.beginPath();
                  ctx.moveTo(tipX, tipY);
                  ctx.lineTo(ax - perpX * arrowSize * 0.5, ay - perpY * arrowSize * 0.5);
                  ctx.lineTo(ax + perpX * arrowSize * 0.5, ay + perpY * arrowSize * 0.5);
                  ctx.closePath();
                  ctx.fillStyle   = `rgba(${rgb.r},${rgb.g},${rgb.b},0.85)`;
                  ctx.fill();
                  ctx.strokeStyle = `rgba(255,255,255,0.6)`;
                  ctx.lineWidth   = 3;
                  ctx.stroke();
                }
              }

              // Label badge
              const fontSize = sh.badgeFontSize;
              ctx.font         = `bold ${fontSize}px system-ui, sans-serif`;
              ctx.textAlign    = "center";
              ctx.textBaseline = "middle";
              const textMetrics = ctx.measureText(label);
              const badgeW = textMetrics.width + 18;
              const badgeH = fontSize + 6;
              const badgeY = py + sh.outerRingRadius + 20;

              // Badge shadow
              ctx.fillStyle = `rgba(0,0,0,0.4)`;
              ctx.beginPath();
              ctx.roundRect(px - badgeW / 2 + 3, badgeY - badgeH / 2 + 3, badgeW, badgeH, 4);
              ctx.fill();

              // Badge background
              ctx.fillStyle = `rgba(0,0,0,${sh.badgeBackgroundOpacity})`;
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
        }
      }
    }

    // ── Draw label badges ────────────────────────────────────────────────────
    if (showLabels) {
      const fontSize = CFG.overlayLabel.fontSize > 0
        ? CFG.overlayLabel.fontSize
        : Math.max(CFG.overlayLabel.minFontSize, Math.round(w / CFG.overlayLabel.autoScaleDivisor));

      ctx.font         = `bold ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";

      const { paddingX, paddingY, borderRadius, backgroundOpacity, borderWidth, borderDashed, borderDash } =
        CFG.overlayLabel;

      for (const zone of visibleZones) {
      // Skip tool zones in label rendering
      if (!showTools && classifyZone(zone.label) === "tool") continue;

        const displayLabel = getDisplayLabel(zone.label, false);
        const color   = COLORS[classifyZone(zone.label)] ?? COLORS.unknown;
        const centroid = zoneCentroid(zone, w, h);

        // Shift badge slightly right and down
        const bx = centroid.x - w * 0.015;
        const by = centroid.y + h * 0.04;

        const m  = ctx.measureText(displayLabel);
        const bw = m.width + paddingX * 2;
        const bh = fontSize + paddingY * 2;

        // Background
        ctx.save();
        ctx.fillStyle = `rgba(0,0,0,${backgroundOpacity})`;
        ctx.beginPath();
        ctx.roundRect(bx - bw / 2, by - bh / 2, bw, bh, borderRadius);
        ctx.fill();

        // Dashed border
        if (borderWidth > 0) {
          if (borderDashed) ctx.setLineDash(borderDash);
          ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},0.8)`;
          ctx.lineWidth   = borderWidth;
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Text
        ctx.fillStyle = `rgba(255,255,255,1)`;
        ctx.fillText(displayLabel, bx, by);
        ctx.restore();
      }
    }

    // Save the rendered frame
    const pngBuffer = await canvas.encode("png");
    fs.writeFileSync(tmpPath, pngBuffer);

    rendered++;
    process.stdout.write(`\r  Rendering frame ${rendered}/${total}…`);
  }

  // ── Encode video with ffmpeg ─────────────────────────────────────────────────

  console.log(`\nEncoding video…`);

  const outputFile     = path.join(projectDir, "footage_boundary.mp4");
  const concatListPath = path.join(projectDir, "_concat_boundary.txt");

  const concatContent = frameFiles
    .map((f) => {
      const absPath = path.join(tmpDir, f).replace(/\\/g, "/").replace(/'/g, "'\\''");
      return `file '${absPath}'\nduration ${(1 / fps).toFixed(6)}`;
    })
    .join("\n");

  fs.writeFileSync(concatListPath, concatContent + "\n", "utf8");

  const cmd = [
    "ffmpeg",
    "-y",
    "-f concat",
    "-safe 0",
    `-i "${concatListPath}"`,
    "-c:v libx264",
    "-pix_fmt yuv420p",
    "-crf 18",
    `"${outputFile}"`,
  ].join(" ");

  try {
    execSync(cmd, { stdio: "inherit" });
    console.log(`\nSaved: ${outputFile}`);
  } finally {
    fs.rmSync(tmpDir,  { recursive: true, force: true });
    fs.rmSync(concatListPath, { force: true });
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
