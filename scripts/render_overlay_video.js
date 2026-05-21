#!/usr/bin/env node
/**
 * render_overlay_video.js
 *
 * Renders boundary overlay polygons from labels_points.json onto each frame
 * image and outputs an MP4 video using ffmpeg.
 *
 * Output: <projectDir>/footage_overlay.mp4
 *
 * Requires:
 *   npm install @napi-rs/canvas
 *   ffmpeg on PATH
 *
 * Usage:
 *   node scripts/render_overlay_video.js [projectDir] [--fps=N] [--start=N] [--end=N] [--no-labels] [--no-boundary] [--no-safe]
 *
 * Defaults:
 *   projectDir → D:\Projects\Features\Feature_2
 *   fps        → 18
 *   start      → 0
 *   end        → (last frame)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ── Load canvas dynamically (documented dependency) ────────────────────────
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

// ── Zone colour & classification (mirrors types.ts + rleDecoder.ts) ──────────

const ZONE_CLASSES = {
  // Danger (red) — critical structures
  danger: new Set([
    "Phrenic nerve",
    "Aortic root",
    "Right atrium",
    "Left atrium",
    "Right ventricle",
    "Left ventricle",
    "SVC",
    "IVC",
    "Pulmonary artery",
    "Pulmonary vein",
    "Coronary artery",
    "Mitral valve",
    "Tricuspid valve",
    "Aortic valve",
  ]),
  // Safe (green) — recommended working areas
  safe: new Set([
    "Pericardium",
    "Grasper",
    "Needle holder",
    "Safe zone",
  ]),
  // Other (orange) — intermediate structures
  other: new Set([
    "Auricles",
    "Epicardial adipose tissue",
    "Fossa ovalis",
  ]),
};

const COLORS = {
  danger: { r: 239, g: 68,  b: 68  },  // #ef4444
  safe:   { r: 34,  g: 197, b: 94  },  // #22c55e
  other:  { r: 249, g: 115, b: 22  },  // #f97316
  tool:   { r: 59,  g: 130, b: 246  },  // #3b82f6
};

function classifyZone(label) {
  if (ZONE_CLASSES.danger.has(label)) return "danger";
  if (ZONE_CLASSES.safe.has(label))   return "safe";
  if (ZONE_CLASSES.other.has(label))  return "other";
  if (label === "Foreground")         return "foreground";
  return "safe"; // default unknown zones to safe
}

// ── Overlay configuration (mirrors overlayConfig.ts) ───────────────────────

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
    safeFillOpacity:   0.45,
    otherFillOpacity:  0.45,
  },
  overlayLabel: {
    fontSize: 14,
    paddingX: 8,
    paddingY: 5,
    borderRadius: 3,
    backgroundOpacity: 0.75,
    borderWidth: 1.5,
    borderDashed: true,
    borderDash: [4, 3],
  },
};

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {};
const positional = [];
for (const a of args) {
  const m = a.match(/^--(\w+)=(.+)$/);
  if (m) flags[m[1]] = m[2];
  else if (!a.startsWith("--")) positional.push(a);
}

const projectDir  = path.resolve(positional[0] ?? "D:\\Projects\\Features\\Feature_2");
const fps         = parseInt(flags.fps    ?? "18",  10);
const startFrame  = flags.start !== undefined ? parseInt(flags.start, 10) : null;
const endFrame    = flags.end   !== undefined ? parseInt(flags.end,   10) : null;
const showLabels  = flags["labels"]     !== "false";
const showBoundary= flags["boundary"]   !== "false";
const showSafe    = flags["safe"]       !== "false";

// ── Validate inputs ─────────────────────────────────────────────────────────

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

// ── Load labels_points.json ─────────────────────────────────────────────────

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

// ── Collect frame files ─────────────────────────────────────────────────────

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

console.log(`Frames  : ${frameFiles.length} (${startFrame ?? 0} → ${endFrame ?? frameFiles.length - 1})`);
console.log(`FPS     : ${fps}`);
console.log(`Labels  : ${showLabels ? "on" : "off"}`);
console.log(`Boundary: ${showBoundary ? "on" : "off"}`);
console.log(`Safe    : ${showSafe ? "on" : "off"}`);
console.log();

// ── Rendering helpers ───────────────────────────────────────────────────────

function getFillOpacity(category) {
  if (category === "danger")  return Math.max(0.3, CFG.boundaryFill.dangerFillOpacity);
  if (category === "safe")    return Math.max(0.22, CFG.boundaryFill.safeFillOpacity);
  if (category === "other")   return Math.max(0.22, CFG.boundaryFill.otherFillOpacity);
  if (category === "tool")    return 0.18;
  return CFG.boundaryFill.opacity;
}

function getLineWidth(category, isTarget) {
  if (isTarget) return 5.5;
  if (category === "danger") return 4.2;
  if (category === "safe")   return 3;
  if (category === "other")  return 3;
  return 3;
}

function getCoreWidth(category, isTarget) {
  if (isTarget) return 2.35;
  if (category === "danger") return 1.45;
  if (category === "safe")   return 1.1;
  if (category === "other")  return 1.1;
  return 1.1;
}

function buildPolygonPath(ctx, polygon, w, h) {
  ctx.beginPath();
  for (let i = 0; i < polygon.length; i++) {
    const { x, y } = polygon[i];
    const px = x * (w - 1);
    const py = y * (h - 1);
    if (i === 0) ctx.moveTo(px, py);
    else         ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/**
 * Compute the centroid of a polygon in canvas pixel coordinates.
 */
function polygonCentroid(polygon, w, h) {
  let cx = 0, cy = 0;
  for (const { x, y } of polygon) { cx += x * (w - 1); cy += y * (h - 1); }
  return { x: cx / polygon.length, y: cy / polygon.length };
}

/**
 * Abbreviate zone labels for badge display.
 */
function abbreviate(label) {
  const abbr = {
    "Phrenic nerve": "Phrenic N.",
    "Aortic root": "Aortic Root",
    "Right atrium": "Right Atrium",
    "Left atrium": "Left Atrium",
    "Right ventricle": "Right Ventricle",
    "Left ventricle": "Left Ventricle",
    "Pericardium": "Pericardium",
    "Grasper": "Grasper",
    "Needle holder": "Needle Holder",
    "Auricles": "Auricles",
    "Epicardial adipose tissue": "Epi. Fat",
    "Fossa ovalis": "Fossa Ovalis",
    "SVC": "SVC",
    "IVC": "IVC",
    "Pulmonary artery": "Pulm. Artery",
    "Pulmonary vein": "Pulm. Vein",
    "Coronary artery": "Coronary A.",
    "Mitral valve": "Mitral Valve",
    "Tricuspid valve": "Tricuspid Valve",
    "Aortic valve": "Aortic Valve",
    "Safe zone": "Safe Zone",
  };
  return abbr[label] ?? label;
}

// ── Per-frame render ────────────────────────────────────────────────────────

async function main() {
  const tmpDir = path.join(projectDir, "_overlay_frames");
  fs.mkdirSync(tmpDir, { recursive: true });

  let rendered = 0;
  const total  = frameFiles.length;

for (const frameFile of frameFiles) {
  const framePath = path.join(framesDir, frameFile);
  const tmpPath   = path.join(tmpDir, frameFile);

  // Load the base frame image
  const img  = await loadImage(fs.readFileSync(framePath));
  const w    = img.width;
  const h    = img.height;

  const canvas = new Canvas(w, h);
  const ctx   = canvas.getContext("2d");

  // 1. Draw the base frame
  ctx.drawImage(img, 0, 0);

  // 2. Load overlay data for this frame
  const frameData = labelMap.get(frameFile);
  if (frameData) {
    const zones = (frameData.zones || []).filter(
      (z) => z.label !== "Foreground"
    );
    const lines = frameData.lines || [];

    // Skip safe zones if flag is off
    const visibleZones = zones.filter((z) => {
      if (!showSafe && classifyZone(z.label) === "safe") return false;
      return true;
    });

    ctx.lineJoin = "round";
    ctx.lineCap  = "round";

    // ── Draw boundary overlays ─────────────────────────────────────────────
    if (showBoundary) {
      for (const zone of visibleZones) {
        const category = classifyZone(zone.label);
        const isTarget  = zone.label === "Aortic root";
        const color     = COLORS[category] ?? COLORS.safe;
        const fillOpacity  = getFillOpacity(category);
        const lineWidth    = getLineWidth(category, isTarget)  * (w / 1280);
        const coreWidth    = getCoreWidth(category, isTarget) * (w / 1280);
        const dash         = CFG.boundaryLine.style === "dashed"
          ? [CFG.boundaryLine.dashLength, CFG.boundaryLine.gapLength]
          : [];

        for (const polygon of zone.points) {
          if (polygon.length < 3) continue;

          // Fill
          buildPolygonPath(ctx, polygon, w, h);
          ctx.save();
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = fillOpacity;
          ctx.fillStyle   = `rgb(${color.r},${color.g},${color.b})`;
          ctx.fill();
          ctx.restore();

          // Outer dashed stroke
          buildPolygonPath(ctx, polygon, w, h);
          ctx.save();
          ctx.setLineDash(dash);
          ctx.strokeStyle  = `rgba(${color.r},${color.g},${color.b},0.95)`;
          ctx.lineWidth    = lineWidth;
          ctx.shadowColor  = `rgba(${color.r},${color.g},${color.b},0.8)`;
          ctx.shadowBlur   = 10 * (w / 1280) * (isTarget ? 1.75 : category === "danger" ? 1.28 : 1);
          ctx.stroke();
          ctx.restore();

          // Inner white core stroke
          buildPolygonPath(ctx, polygon, w, h);
          ctx.save();
          ctx.setLineDash(dash);
          ctx.strokeStyle = `rgba(255,255,255,${category === "danger" ? 0.9 : 0.78})`;
          ctx.lineWidth   = coreWidth;
          ctx.stroke();
          ctx.restore();

          ctx.setLineDash([]);
        }
      }

      // ── Draw line annotations ──────────────────────────────────────────────
      for (const line of lines) {
        const color = { r: 250, g: 204, b: 21 }; // #facc15 orange-yellow
        const lineWidth = 4 * (w / 1280);
        const dash = [24, 8];

        for (const pts of line.points) {
          if (pts.length < 2) continue;
          ctx.beginPath();
          for (let i = 0; i < pts.length; i++) {
            const px = pts[i].x * (w - 1);
            const py = pts[i].y * (h - 1);
            if (i === 0) ctx.moveTo(px, py);
            else         ctx.lineTo(px, py);
          }
          ctx.save();
          ctx.setLineDash(dash);
          ctx.strokeStyle  = `rgba(${color.r},${color.g},${color.b},1)`;
          ctx.lineWidth    = lineWidth;
          ctx.shadowColor  = `rgba(${color.r},${color.g},${color.b},0.6)`;
          ctx.shadowBlur   = 10 * (w / 1280);
          ctx.stroke();
          ctx.restore();
          ctx.setLineDash([]);
        }
      }
    }

    // ── Draw label badges ───────────────────────────────────────────────────
    if (showLabels) {
      const fontSize = Math.max(14, Math.round(w / 90));
      ctx.font        = `bold ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textAlign   = "center";
      ctx.textBaseline = "middle";

      const { paddingX, paddingY, borderRadius, backgroundOpacity, borderWidth, borderDashed, borderDash } =
        CFG.overlayLabel;

      for (const zone of visibleZones) {
        for (const polygon of zone.points) {
          if (polygon.length < 3) continue;
          const centroid = polygonCentroid(polygon, w, h);
          const label   = abbreviate(zone.label);
          const color   = COLORS[classifyZone(zone.label)] ?? COLORS.safe;
          const labelAlpha = 1;

          // Shift badge slightly down and to the right
          const bx = centroid.x - w * 0.015;
          const by = centroid.y + h * 0.04;

          const m   = ctx.measureText(label);
          const bw  = m.width + paddingX * 2;
          const bh  = fontSize + paddingY * 2;

          // Background
          ctx.save();
          ctx.fillStyle = `rgba(0,0,0,${backgroundOpacity * labelAlpha})`;
          ctx.beginPath();
          ctx.roundRect(bx - bw / 2, by - bh / 2, bw, bh, borderRadius);
          ctx.fill();

          // Border
          if (borderWidth > 0) {
            if (borderDashed) ctx.setLineDash(borderDash);
            ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},0.8)`;
            ctx.lineWidth   = borderWidth;
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // Text
          ctx.fillStyle = `rgba(255,255,255,${labelAlpha})`;
          ctx.fillText(label, bx, by);
          ctx.restore();
        }
      }
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

const outputFile = path.join(projectDir, "footage_overlay.mp4");
const concatListPath = path.join(projectDir, "_concat_overlay.txt");

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
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(concatListPath, { force: true });
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
