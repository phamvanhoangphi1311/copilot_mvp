#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Export one MP4 per feature from the running web UI.
 *
 * By default this opens the Next.js app in Chrome and captures the same
 * video/canvas overlay stage that users see in the browser.
 *
 * Usage:
 *   npm run export:videos
 *   node scripts/export_feature_videos.js --fps=18
 *   node scripts/export_feature_videos.js --capture=seek --duration=8
 *   node scripts/export_feature_videos.js --features=3 --frames=201
 *   node scripts/export_feature_videos.js --crf=4 --preset=slow
 *   node scripts/export_feature_videos.js --features=3 --feature3-tools=hide --output-suffix=hide_tools
 *   node scripts/export_feature_videos.js --source=frames --fps=18
 *   node scripts/export_feature_videos.js --source=overlay-frames --fps=18
 */

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright-core");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_PORT = 3100;

function parseArgs(argv) {
  const options = {
    url: "",
    outDir: path.join(ROOT, "exports", "videos"),
    duration: 8,
    fps: 18,
    width: 1920,
    height: 1080,
    frames: 0,
    features: [1, 2, 3],
    keepFrames: false,
    port: DEFAULT_PORT,
    source: "web",
    capture: "seek",
    crf: 12,
    preset: "veryfast",
    feature3Tools: "show",
    outputSuffix: "",
  };

  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue = "true"] = arg.slice(2).split("=");
    if (key === "url") options.url = rawValue;
    if (key === "out" || key === "outDir") options.outDir = path.resolve(rawValue);
    if (key === "duration") options.duration = Number(rawValue);
    if (key === "fps") options.fps = Number(rawValue);
    if (key === "width") options.width = Number(rawValue);
    if (key === "height") options.height = Number(rawValue);
    if (key === "frames") options.frames = Number(rawValue);
    if (key === "port") options.port = Number(rawValue);
    if (key === "source") options.source = rawValue;
    if (key === "capture") options.capture = rawValue;
    if (key === "crf") options.crf = Number(rawValue);
    if (key === "preset") options.preset = rawValue;
    if (key === "feature3-tools") options.feature3Tools = rawValue;
    if (key === "output-suffix" || key === "suffix") {
      options.outputSuffix = rawValue.replace(/[^a-zA-Z0-9_-]/g, "");
    }
    if (key === "features") {
      options.features = rawValue
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => [1, 2, 3].includes(value));
    }
    if (key === "keep-frames") options.keepFrames = rawValue !== "false";
  }

  if (!Number.isFinite(options.duration) || options.duration <= 0) {
    throw new Error("--duration must be a positive number");
  }
  if (!Number.isFinite(options.fps) || options.fps <= 0) {
    throw new Error("--fps must be a positive number");
  }
  if (!Number.isFinite(options.frames) || options.frames < 0) {
    throw new Error("--frames must be a non-negative number");
  }
  if (options.features.length === 0) {
    throw new Error("--features must include at least one of 1,2,3");
  }
  if (!["overlay-frames", "frames", "web"].includes(options.source)) {
    throw new Error("--source must be overlay-frames, frames, or web");
  }
  if (!["seek", "realtime"].includes(options.capture)) {
    throw new Error("--capture must be seek or realtime");
  }
  if (!Number.isFinite(options.crf) || options.crf < 0 || options.crf > 51) {
    throw new Error("--crf must be a number from 0 to 51");
  }
  if (!["show", "hide"].includes(options.feature3Tools)) {
    throw new Error("--feature3-tools must be show or hide");
  }

  return options;
}

function getOutputFile(options, featureNumber) {
  const suffix = options.outputSuffix ? `_${options.outputSuffix}` : "";
  return path.join(options.outDir, `feature_${featureNumber}${suffix}.mp4`);
}

function findExecutable(candidates) {
  for (const candidate of candidates) {
    const result = spawnSync("bash", ["-lc", `command -v ${candidate}`], {
      encoding: "utf8",
    });
    const executable = result.stdout.trim();
    if (result.status === 0 && executable) return executable;
  }
  return null;
}

function waitForUrl(url, timeoutMs = 60000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15000) });
        if (response.status < 500) {
          resolve();
          return;
        }
      } catch {
        // Server is not ready yet.
      }

      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(tick, 500);
    };
    tick();
  });
}

async function canReachUrl(url) {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(1500),
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function findExistingAppUrl(preferredPort) {
  const ports = Array.from(new Set([preferredPort, 3000, 3001, 3002, 3003, 3004, 3005]));
  for (const port of ports) {
    const url = `http://127.0.0.1:${port}`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) continue;
      const html = await response.text();
      if (html.includes("CARDIOVIS") || html.includes("/_next/")) {
        return url;
      }
    } catch {
      // Try the next likely dev-server port.
    }
  }
  return null;
}

async function startServer(options) {
  if (options.url) return { url: options.url, proc: null };

  const url = `http://127.0.0.1:${options.port}`;
  const existingAppUrl = await findExistingAppUrl(options.port);
  if (existingAppUrl) {
    console.log(`Using existing app server at ${existingAppUrl}`);
    return { url: existingAppUrl, proc: null };
  }

  if (await canReachUrl(url)) {
    console.log(`Using existing dev server at ${url}`);
    return { url, proc: null };
  }

  const proc = spawn("npm", ["run", "dev", "--", "-p", String(options.port)], {
    cwd: ROOT,
    env: { ...process.env, BROWSER: "none" },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  proc.stdout.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
  proc.stderr.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));

  await waitForUrl(url);
  return { url, proc };
}

async function selectFeature(page, featureNumber) {
  const label = `Phase ${featureNumber}`;
  const selector = page.locator("#feature-selector");
  const tagName = await selector.evaluate((element) => element.tagName.toLowerCase()).catch(() => "");
  if (tagName === "select") {
    await selector.selectOption({ label });
  } else {
    await selector.click();
    await page.getByRole("button", { name: new RegExp(`^${label}`) }).click();
  }
  await page.waitForTimeout(500);
}

async function waitForVideoReady(page) {
  await page.locator('[data-testid="video-export-stage"]').waitFor({
    state: "visible",
    timeout: 60000,
  });
  await page.waitForFunction(() => {
    const stage = document.querySelector('[data-testid="video-export-stage"]');
    const video = stage?.querySelector("video");
    return Boolean(video && video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0);
  }, { timeout: 60000 });
}

async function ensureFullLabels(page) {
  const fullLabelsButton = page.getByRole("button", { name: "Full Labels", exact: true });
  if (await fullLabelsButton.isVisible().catch(() => false)) {
    await fullLabelsButton.click();
    await page.waitForTimeout(250);
    return;
  }

  const showFullLabelsButton = page.getByRole("button", { name: "Show Full Labels", exact: true });
  if (await showFullLabelsButton.isVisible().catch(() => false)) {
    await showFullLabelsButton.click();
    await page.waitForTimeout(250);
  }
}

async function ensureButtonState(page, showName, hideName) {
  const showButton = page.getByRole("button", { name: showName, exact: true });
  if (await showButton.isVisible().catch(() => false)) {
    await showButton.click();
    await page.waitForTimeout(250);
    return;
  }

  await page.getByRole("button", { name: hideName, exact: true })
    .waitFor({ state: "visible", timeout: 2500 })
    .catch(() => {});
}

async function configureFeatureUi(page, options, featureNumber) {
  await ensureFullLabels(page);

  if (featureNumber === 3) {
    await ensureButtonState(page, "Show Target Zone", "Hide Target Zone");
    await ensureButtonState(page, "Show Danger Zone", "Hide Danger Zone");
    if (options.feature3Tools === "hide") {
      await ensureButtonState(page, "Hide Tools", "Show Tools");
    } else {
      await ensureButtonState(page, "Show Tools", "Hide Tools");
    }
  }
}

async function waitForFeatureRender(page, featureNumber) {
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise((resolve) => setTimeout(resolve, 80));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

  if (featureNumber === 3) {
    await page.waitForFunction(() => {
      const stage = document.querySelector('[data-testid="video-export-stage"]');
      const svg = stage?.querySelector("svg");
      const targetLabel = Array.from(stage?.querySelectorAll("div") ?? [])
        .some((element) => element.textContent?.includes("Aortic root"));
      return Boolean(svg && targetLabel);
    }, { timeout: 10000 });
  }
}

async function startFeaturePlayback(page) {
  await page.evaluate(async () => {
    const stage = document.querySelector('[data-testid="video-export-stage"]');
    const video = stage?.querySelector("video");
    if (!video) throw new Error("Video element not found");

    video.pause();
    await new Promise((resolve, reject) => {
      if (video.currentTime < 0.01) {
        resolve();
        return;
      }
      const done = () => {
        video.removeEventListener("seeked", done);
        resolve();
      };
      const fail = () => {
        video.removeEventListener("error", fail);
        reject(new Error("Video seek failed"));
      };
      video.addEventListener("seeked", done, { once: true });
      video.addEventListener("error", fail, { once: true });
      video.currentTime = 0;
    });

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await video.play();
  });
}

async function stopFeaturePlayback(page) {
  await page.evaluate(() => {
    const video = document.querySelector('[data-testid="video-export-stage"] video');
    video?.pause();
  });
}

async function seekAndRender(page, timeSeconds) {
  await page.evaluate(async (time) => {
    const stage = document.querySelector('[data-testid="video-export-stage"]');
    const video = stage?.querySelector("video");
    if (!video) throw new Error("Video element not found");

    video.pause();
    await new Promise((resolve, reject) => {
      const targetTime = Math.min(Math.max(time, 0), Math.max(video.duration - 0.05, 0));
      if (Math.abs(video.currentTime - targetTime) < 0.001) {
        resolve();
        return;
      }

      const done = () => {
        video.removeEventListener("seeked", done);
        resolve();
      };
      const fail = () => {
        video.removeEventListener("error", fail);
        reject(new Error("Video seek failed"));
      };
      video.addEventListener("seeked", done, { once: true });
      video.addEventListener("error", fail, { once: true });
      video.currentTime = targetTime;
    });

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, timeSeconds);
}

function getFeatureDir(featureNumber) {
  return path.join(ROOT, `Feature_${featureNumber}`);
}

function getFrameFiles(featureDir) {
  const candidates = ["frames", "frame"].map((name) => path.join(featureDir, name));
  const frameDir = candidates.find((dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory());
  if (!frameDir) {
    throw new Error(`No frames/ folder found in ${featureDir}`);
  }

  const frameFiles = fs.readdirSync(frameDir)
    .filter((file) => /^frame_\d+\.(png|jpe?g)$/i.test(file))
    .sort()
    .map((file) => path.join(frameDir, file));

  if (frameFiles.length === 0) {
    throw new Error(`No frame_XXXXX images found in ${frameDir}`);
  }

  return { frameDir, frameFiles };
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function imageDataUri(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mime = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizePolygons(points) {
  if (!Array.isArray(points) || points.length === 0) return [];
  if ("x" in points[0]) return [points];
  return points;
}

function polygonCentroid(polygons) {
  let x = 0;
  let y = 0;
  let count = 0;
  for (const polygon of polygons) {
    for (const point of polygon) {
      x += point.x;
      y += point.y;
      count += 1;
    }
  }
  if (!count) return null;
  return { x: x / count, y: y / count };
}

function largestPolygonBounds(polygons) {
  let best = null;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length < 3) continue;
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    for (const point of polygon) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    const width = Math.max(maxX - minX, 0.01);
    const height = Math.max(maxY - minY, 0.01);
    const area = width * height;
    if (!best || area > best.area) {
      best = {
        cx: minX + width / 2,
        cy: minY + height / 2,
        area,
      };
    }
  }
  return best;
}

function makeFeature3ReticleSvg(bounds, width, height, frameIndex = 0) {
  if (!bounds) return "";
  const x = bounds.cx * width;
  const y = bounds.cy * height;
  const scale = width / 1920;
  const outerRadius = (22 + Math.sin(frameIndex / 6) * 2) * scale;
  const innerRadius = (12 + Math.sin(frameIndex / 6) * 1.2) * scale;
  const centerRadius = 5.2 * scale;
  const dotRadius = 1.8 * scale;
  const long = 36 * scale;
  const short = 16 * scale;
  const green = "#16A34A";

  return [
    `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" filter="url(#feature3-target-glow)">`,
    `<circle r="${outerRadius.toFixed(1)}" fill="rgba(22,163,74,0.18)" stroke="${green}" stroke-width="${(2.4 * scale).toFixed(1)}" opacity="0.92"/>`,
    `<circle r="${innerRadius.toFixed(1)}" fill="none" stroke="#dcfce7" stroke-width="${(1.6 * scale).toFixed(1)}" opacity="0.95"/>`,
    `<line x1="${(-long).toFixed(1)}" y1="0" x2="${(-short).toFixed(1)}" y2="0" stroke="${green}" stroke-width="${(3 * scale).toFixed(1)}" stroke-linecap="round"/>`,
    `<line x1="${short.toFixed(1)}" y1="0" x2="${long.toFixed(1)}" y2="0" stroke="${green}" stroke-width="${(3 * scale).toFixed(1)}" stroke-linecap="round"/>`,
    `<line x1="0" y1="${(-long).toFixed(1)}" x2="0" y2="${(-short).toFixed(1)}" stroke="${green}" stroke-width="${(3 * scale).toFixed(1)}" stroke-linecap="round"/>`,
    `<line x1="0" y1="${short.toFixed(1)}" x2="0" y2="${long.toFixed(1)}" stroke="${green}" stroke-width="${(3 * scale).toFixed(1)}" stroke-linecap="round"/>`,
    `<circle r="${centerRadius.toFixed(1)}" fill="#dcfce7" stroke="${green}" stroke-width="${(2.2 * scale).toFixed(1)}"/>`,
    `<circle r="${dotRadius.toFixed(1)}" fill="#052e16"/>`,
    "</g>",
  ].join("\n");
}

function classifyOverlayLabel(label, featureNumber) {
  if (featureNumber === 3) {
    if (label === "Aortic root") return "target";
    if (label === "Auricles" || label === "Right atrium") return "avoid";
    if (label === "Epicardial fat on aortic") return "caution";
    if (label === "Grasper" || label === "Needle holders") return "tool";
    return "other";
  }

  if (label === "Phrenic nerve" || label === "Aortic root" || label === "Auricles") return "danger";
  if (label === "Pericardium" || label === "Pericardium boundary" || label === "Grasper" || label === "Needle holders") return "safe";
  return "other";
}

function overlayColor(label, featureNumber) {
  if (featureNumber === 3) {
    const colors = {
      "Aortic root": "#22C55E",
      Auricles: "#EF4444",
      "Right atrium": "#EF4444",
      "Epicardial fat on aortic": "#FFAA00",
      Grasper: "#3B82F6",
      "Needle holders": "#88EEFF",
    };
    return colors[label] || "#AA66FF";
  }

  const colors = {
    "Phrenic nerve": "#3296FF",
    "Aortic root": "#EF4444",
    Auricles: "#EF4444",
    "Pericardium boundary": "#22C55E",
    Pericardium: "#FF5050",
    Grasper: "#32DC64",
    "Needle holders": "#32DC64",
    "Epicardial adipose tissue": "#F97316",
    "Epicardial fat on aortic": "#F97316",
    "Incision line": "#32DC50",
    Centerline: "#32DC50",
  };
  return colors[label] || "#F97316";
}

function displayLabel(label, featureNumber) {
  if (featureNumber === 3 && label === "Auricles") return "Right atrium";
  return label;
}

function shouldRenderZone(label, featureNumber, options = {}) {
  if (featureNumber === 3) {
    if (options.feature3Tools === "hide" && (label === "Grasper" || label === "Needle holders")) {
      return false;
    }
    return ["Aortic root", "Auricles", "Epicardial fat on aortic", "Grasper", "Needle holders"].includes(label);
  }
  return label !== "Foreground";
}

function pointList(points, width, height) {
  return points
    .map((point) => `${(point.x * (width - 1)).toFixed(1)},${(point.y * (height - 1)).toFixed(1)}`)
    .join(" ");
}

function makeLabelSvg(label, x, y, color, width, height) {
  const fontSize = Math.max(14, Math.round(width / 110));
  const text = xmlEscape(label);
  const estimatedWidth = Math.max(48, label.length * fontSize * 0.62 + 18);
  const boxHeight = fontSize + 10;
  const boxX = Math.max(4, Math.min(width - estimatedWidth - 4, x - estimatedWidth / 2));
  const boxY = Math.max(4, Math.min(height - boxHeight - 4, y - boxHeight / 2));

  return [
    `<rect x="${boxX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${estimatedWidth.toFixed(1)}" height="${boxHeight}" rx="4" fill="rgba(0,0,0,0.78)" stroke="${color}" stroke-width="1.5"/>`,
    `<text x="${(boxX + estimatedWidth / 2).toFixed(1)}" y="${(boxY + fontSize + 3).toFixed(1)}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" fill="white">${text}</text>`,
  ].join("\n");
}

function makeOverlaySvg({ imagePath, record, featureNumber, width, height, frameIndex = 0, options = {} }) {
  const zones = Array.isArray(record?.zones) ? record.zones : [];
  const lines = Array.isArray(record?.lines) ? record.lines : [];
  const body = [];
  const labels = [];
  let feature3TargetBounds = null;

  body.push(`<image href="${imageDataUri(imagePath)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/>`);

  for (const zone of zones) {
    if (!shouldRenderZone(zone.label, featureNumber, options)) continue;
    const polygons = normalizePolygons(zone.points);
    if (!polygons.length) continue;
    const color = overlayColor(zone.label, featureNumber);
    const role = classifyOverlayLabel(zone.label, featureNumber);
    const strokeWidth = role === "target" ? 4.8 : role === "danger" || role === "avoid" ? 4.2 : 3.2;
    const fillOpacity = role === "target" ? 0.20 : role === "danger" || role === "avoid" ? 0.16 : 0.12;
    const dash = featureNumber === 3 ? "8 8" : "6 8";
    if (featureNumber === 3 && zone.label === "Aortic root") {
      feature3TargetBounds = largestPolygonBounds(polygons);
    }

    for (const polygon of polygons) {
      if (!Array.isArray(polygon) || polygon.length < 2) continue;
      const points = pointList(polygon, width, height);
      body.push(`<polygon points="${points}" fill="${color}" fill-opacity="${fillOpacity}" stroke="${color}" stroke-opacity="0.95" stroke-width="${strokeWidth}" stroke-dasharray="${dash}" stroke-linejoin="round"/>`);
      body.push(`<polygon points="${points}" fill="none" stroke="white" stroke-opacity="0.75" stroke-width="${Math.max(1.1, strokeWidth * 0.34).toFixed(1)}" stroke-dasharray="${dash}" stroke-linejoin="round"/>`);
    }

    const centroid = polygonCentroid(polygons);
    if (centroid) {
      makeLabelSvg(
        displayLabel(zone.label, featureNumber),
        centroid.x * width - width * 0.015,
        centroid.y * height + height * 0.04,
        color,
        width,
        height,
      ).split("\n").forEach((line) => labels.push(line));
    }
  }

  if (featureNumber === 3 && feature3TargetBounds) {
    body.push(makeFeature3ReticleSvg(feature3TargetBounds, width, height, frameIndex));
  }

  for (const line of lines) {
    if (!Array.isArray(line.points) || line.points.length < 2) continue;
    const color = overlayColor(line.label, featureNumber);
    const points = pointList(line.points, width, height);
    body.push(`<polyline points="${points}" fill="none" stroke="${color}" stroke-opacity="1" stroke-width="5" stroke-dasharray="9 7" stroke-linecap="round" stroke-linejoin="round"/>`);
    const mid = line.points[Math.floor(line.points.length / 2)];
    makeLabelSvg(line.label, mid.x * width, mid.y * height, color, width, height)
      .split("\n")
      .forEach((item) => labels.push(item));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
  <filter id="feature3-target-glow" x="-80%" y="-80%" width="260%" height="260%">
    <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#16A34A" flood-opacity="0.9"/>
  </filter>
</defs>
${body.concat(labels).join("\n")}
</svg>\n`;
}

function getPointRecords(featureDir, featureNumber) {
  const fileName = featureNumber === 2 ? "labels_points.json" : "points.json";
  const records = readJsonIfExists(path.join(featureDir, fileName));
  const map = new Map();
  for (const record of records) {
    if (record?.image) map.set(record.image, record);
  }
  return map;
}

function renderOverlayFrames(options, featureNumber) {
  const featureDir = getFeatureDir(featureNumber);
  const { frameDir, frameFiles } = getFrameFiles(featureDir);
  const recordMap = getPointRecords(featureDir, featureNumber);
  const renderedDir = fs.mkdtempSync(path.join(os.tmpdir(), `feature-${featureNumber}-overlay-`));

  console.log(`\nFeature ${featureNumber}: rendering overlays for ${frameFiles.length} frames`);
  frameFiles.forEach((imagePath, index) => {
    const imageName = path.basename(imagePath);
    const record = recordMap.get(imageName);
    const svg = makeOverlaySvg({
      imagePath,
      record,
      featureNumber,
      width: options.width,
      height: options.height,
      frameIndex: index,
      options,
    });
    fs.writeFileSync(path.join(renderedDir, `frame_${String(index).padStart(6, "0")}.svg`), svg, "utf8");
  });

  console.log(`Feature ${featureNumber}: source frames from ${frameDir}`);
  return {
    renderedDir,
    frameFiles: fs.readdirSync(renderedDir).sort().map((file) => path.join(renderedDir, file)),
  };
}

function encodeFrameList({ frameFiles, fps, outputFile, crf, preset }) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const tempFrameDir = fs.mkdtempSync(path.join(os.tmpdir(), "feature-export-frames-"));

  frameFiles.forEach((sourceFile, index) => {
    const extension = path.extname(sourceFile).toLowerCase();
    const linkPath = path.join(tempFrameDir, `frame_${String(index).padStart(6, "0")}${extension}`);
    fs.symlinkSync(sourceFile, linkPath);
  });

  const firstExtension = path.extname(frameFiles[0]).toLowerCase();

  const ffmpeg = spawnSync("ffmpeg", [
    "-y",
    "-framerate",
    String(fps),
    "-i",
    path.join(tempFrameDir, `frame_%06d${firstExtension}`),
    "-c:v",
    "libx264",
    "-preset",
    preset,
    "-crf",
    String(crf),
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputFile,
  ], { stdio: "inherit" });

  fs.rmSync(tempFrameDir, { recursive: true, force: true });

  if (ffmpeg.status !== 0) {
    throw new Error(`ffmpeg failed while writing ${outputFile}`);
  }
}

function encodeFrames({ frameDir, fps, outputFile, crf, preset }) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const ffmpeg = spawnSync("ffmpeg", [
    "-y",
    "-framerate",
    String(fps),
    "-i",
    path.join(frameDir, "frame_%05d.png"),
    "-c:v",
    "libx264",
    "-preset",
    preset,
    "-crf",
    String(crf),
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputFile,
  ], { stdio: "inherit" });

  if (ffmpeg.status !== 0) {
    throw new Error(`ffmpeg failed while writing ${outputFile}`);
  }
}

function exportFeatureFromFrames(options, featureNumber) {
  const featureDir = getFeatureDir(featureNumber);
  const { frameDir, frameFiles } = getFrameFiles(featureDir);
  const outputFile = getOutputFile(options, featureNumber);

  console.log(`\nFeature ${featureNumber}: ${frameFiles.length} source frames from ${frameDir}`);
  console.log(`Feature ${featureNumber}: encoding ${outputFile}`);
  encodeFrameList({
    frameFiles,
    fps: options.fps,
    outputFile,
    crf: options.crf,
    preset: options.preset,
  });
}

function exportFeatureFromOverlayFrames(options, featureNumber) {
  const { renderedDir, frameFiles } = renderOverlayFrames(options, featureNumber);
  const outputFile = getOutputFile(options, featureNumber);

  try {
    console.log(`Feature ${featureNumber}: encoding overlay video ${outputFile}`);
    encodeFrameList({
      frameFiles,
      fps: options.fps,
      outputFile,
      crf: options.crf,
      preset: options.preset,
    });
  } finally {
    if (options.keepFrames) {
      console.log(`Feature ${featureNumber}: kept overlay frames at ${renderedDir}`);
    } else {
      fs.rmSync(renderedDir, { recursive: true, force: true });
    }
  }
}

async function exportFeature(page, options, featureNumber) {
  console.log(`\nFeature ${featureNumber}: preparing web view`);
  if (featureNumber !== 1) {
    await selectFeature(page, featureNumber);
  }
  await waitForVideoReady(page);
  await configureFeatureUi(page, options, featureNumber);

  await page.addStyleTag({
    content: `
      [data-testid="video-export-stage"] { cursor: none !important; }
    `,
  });
  await waitForFeatureRender(page, featureNumber);

  const stage = page.locator('[data-testid="video-export-stage"]');
  const duration = await page.evaluate(() => {
    const video = document.querySelector('[data-testid="video-export-stage"] video');
    return video?.duration ?? 0;
  });
  const captureDuration = Math.min(options.duration, Math.max(duration - 0.05, 0.1));
  const frameCount = options.frames > 0
    ? Math.round(options.frames)
    : Math.max(1, Math.round(captureDuration * options.fps));
  const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), `feature-${featureNumber}-frames-`));
  const outputFile = getOutputFile(options, featureNumber);

  console.log(`Feature ${featureNumber}: capturing ${frameCount} frames (${options.capture})`);
  const started = Date.now();
  if (options.capture === "realtime") {
    await startFeaturePlayback(page);
  }

  for (let index = 0; index < frameCount; index += 1) {
    if (options.capture === "seek") {
      await seekAndRender(page, index / options.fps);
      await waitForFeatureRender(page, featureNumber);
    }

    const filename = path.join(frameDir, `frame_${String(index + 1).padStart(5, "0")}.png`);
    await stage.screenshot({ path: filename });
    if ((index + 1) % options.fps === 0 || index + 1 === frameCount) {
      process.stdout.write(`\rFeature ${featureNumber}: ${index + 1}/${frameCount} frames`);
    }

    if (options.capture === "realtime") {
      const targetElapsed = ((index + 1) / options.fps) * 1000;
      const waitMs = targetElapsed - (Date.now() - started);
      if (waitMs > 0) {
        await page.waitForTimeout(waitMs);
      }
    }
  }
  if (options.capture === "realtime") {
    await stopFeaturePlayback(page);
  }
  process.stdout.write("\n");

  console.log(`Feature ${featureNumber}: encoding ${outputFile}`);
  encodeFrames({
    frameDir,
    fps: options.fps,
    outputFile,
    crf: options.crf,
    preset: options.preset,
  });

  if (options.keepFrames) {
    console.log(`Feature ${featureNumber}: kept frames at ${frameDir}`);
  } else {
    fs.rmSync(frameDir, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.outDir, { recursive: true });

  if (options.source === "frames") {
    for (const featureNumber of options.features) {
      exportFeatureFromFrames(options, featureNumber);
    }
    console.log(`\nDone. Videos saved in ${options.outDir}`);
    return;
  }

  if (options.source === "overlay-frames") {
    for (const featureNumber of options.features) {
      exportFeatureFromOverlayFrames(options, featureNumber);
    }
    console.log(`\nDone. Videos saved in ${options.outDir}`);
    return;
  }

  const chromePath = process.env.CHROME_PATH || findExecutable([
    "google-chrome-stable",
    "google-chrome",
    "chromium",
    "chromium-browser",
  ]);
  if (!chromePath) {
    throw new Error("Chrome/Chromium not found. Set CHROME_PATH=/path/to/chrome.");
  }

  const server = await startServer(options);
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: options.width, height: options.height },
      deviceScaleFactor: 1,
    });
    page.setDefaultTimeout(60000);
    await page.goto(server.url, { waitUntil: "domcontentloaded" });
    const enterWorkspaceButton = page.getByRole("button", {
      name: /enter surgical video workspace/i,
    });
    if (await enterWorkspaceButton.isVisible().catch(() => false)) {
      await enterWorkspaceButton.click();
      await page.waitForTimeout(800);
    }

    for (const featureNumber of options.features) {
      await exportFeature(page, options, featureNumber);
    }

    console.log(`\nDone. Videos saved in ${options.outDir}`);
  } finally {
    await browser.close();
    if (server.proc) {
      if (process.platform === "win32") {
        server.proc.kill("SIGTERM");
      } else {
        try {
          process.kill(-server.proc.pid, "SIGTERM");
        } catch {
          server.proc.kill("SIGTERM");
        }
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
