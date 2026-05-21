"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  renderLinesOverlay,
  BoundaryZone, BoundaryRecord, LineAnnotation, type BoundaryOverlayPalette,
} from "@/lib/boundaryOverlay";
import { renderSegmentationOverlay, SegmentationTag } from "@/lib/segmentationOverlay";
import SideBar from "@/components_3/SideBar";
import { Zone } from "@/lib/types";
import { BoundaryAnimationManager } from "@/lib/BoundaryAnimationManager";
import { createClassifiedZone } from "@/lib/ZoneFactory";
import { getDisplayName, getRole } from "@/components_3/overlayConfig";

interface FramePoints { frameNum: number; zones: BoundaryZone[]; lines: LineAnnotation[]; }
interface FrameRleMasks { frameNum: number; tags: SegmentationTag[]; }
interface VideoPlayerTabProps {
  initialDir?: string;
  initialPoints?: BoundaryRecord[];
  initialMasks?: Array<{ image: string; tags: SegmentationTag[] }>;
  prefetchedDir?: string;
  surgicalWorkspace?: boolean;
  initialShowOverlay?: boolean;
  initialShowFullLabels?: boolean;
  initialShowToolZones?: boolean;
  guidanceMode?: "voice" | "text" | "both";
  overlayColors?: BoundaryOverlayPalette;
  targetIconStyle?: "reticle" | "crosshair" | "pulse";
}

interface ZoneBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
  area: number;
}

interface ZoneAnchor {
  x: number;
  y: number;
}

interface ZonePixelBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface LabelPlacement {
  labelX: number;
  labelY: number;
}

interface MediaRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function timeToFrameIndex(t: number, fps: number, count: number): number {
  return Math.min(Math.max(Math.round(t * fps), 0), count - 1);
}

function clearCanvas(c: HTMLCanvasElement) {
  c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
}

function formatTime(s: number): string {
  if (!isFinite(s)) return "0:00";
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

function normalizePolygons(
  points: { x: number; y: number }[][] | { x: number; y: number }[],
): { x: number; y: number }[][] {
  if (!Array.isArray(points) || points.length === 0) return [];
  if ("x" in points[0]) return [points as { x: number; y: number }[]];
  return points as { x: number; y: number }[][];
}

function getLargestZoneBounds(zone?: BoundaryZone | null): ZoneBounds | null {
  if (!zone) return null;
  const polygons = normalizePolygons(zone.points);
  let best: ZoneBounds | null = null;

  for (const poly of polygons) {
    if (!poly || poly.length < 3) continue;
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    for (const p of poly) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const width = Math.max(maxX - minX, 0.01);
    const height = Math.max(maxY - minY, 0.01);
    const area = width * height;
    const bounds = {
      x: minX,
      y: minY,
      width,
      height,
      cx: minX + width / 2,
      cy: minY + height / 2,
      area,
    };
    if (!best || bounds.area > best.area) best = bounds;
  }

  return best;
}

function getZoneCentroid(zone?: BoundaryZone | null): ZoneAnchor | null {
  if (!zone) return null;
  const polygons = normalizePolygons(zone.points);
  let cx = 0;
  let cy = 0;
  let count = 0;

  for (const poly of polygons) {
    for (const point of poly) {
      cx += point.x;
      cy += point.y;
      count += 1;
    }
  }

  if (count < 3) return null;
  return { x: cx / count, y: cy / count };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3
    ? clean.split("").map((char) => `${char}${char}`).join("")
    : clean.padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(full, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getContainedMediaRect(
  containerWidth: number,
  containerHeight: number,
  mediaWidth: number,
  mediaHeight: number,
): MediaRect {
  if (containerWidth <= 0 || containerHeight <= 0 || mediaWidth <= 0 || mediaHeight <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  const mediaAspect = mediaWidth / mediaHeight;
  const containerAspect = containerWidth / containerHeight;

  if (mediaAspect > containerAspect) {
    const width = containerWidth;
    const height = width / mediaAspect;
    return { left: 0, top: (containerHeight - height) / 2, width, height };
  }

  const height = containerHeight;
  const width = height * mediaAspect;
  return { left: (containerWidth - width) / 2, top: 0, width, height };
}

function getZonePixelBounds(
  zone: BoundaryZone | null | undefined,
  dimensions: { width: number; height: number },
): ZonePixelBounds | null {
  if (!zone || dimensions.width === 0 || dimensions.height === 0) return null;
  const polygons = normalizePolygons(zone.points);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const poly of polygons) {
    for (const point of poly) {
      minX = Math.min(minX, point.x * dimensions.width);
      minY = Math.min(minY, point.y * dimensions.height);
      maxX = Math.max(maxX, point.x * dimensions.width);
      maxY = Math.max(maxY, point.y * dimensions.height);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

function getZoneAnchor(zone?: BoundaryZone | null): ZoneAnchor | null {
  const centroid = getZoneCentroid(zone);
  if (centroid) return centroid;
  const bounds = getLargestZoneBounds(zone);
  return bounds ? { x: bounds.cx, y: bounds.cy } : null;
}

function getPinnedLabelPlacement(
  anchor: ZoneAnchor | null,
  bounds: ZonePixelBounds | null,
  dimensions: { width: number; height: number },
  options: {
    biasX: number;
    biasY: number;
    labelWidth: number;
    labelHeight: number;
  },
): LabelPlacement | null {
  if (!anchor || dimensions.width === 0 || dimensions.height === 0) return null;
  const anchorX = anchor.x * dimensions.width;
  const anchorY = anchor.y * dimensions.height;
  const marginX = Math.max(28, options.labelWidth * 0.5 + 10);
  const marginY = Math.max(24, options.labelHeight * 0.5 + 8);

  let labelX = anchorX;
  let labelY = anchorY;

  if (bounds) {
    const zoneWidth = Math.max(bounds.maxX - bounds.minX, options.labelWidth + 12);
    const zoneHeight = Math.max(bounds.maxY - bounds.minY, options.labelHeight + 12);
    const preferredX = anchorX + zoneWidth * options.biasX;
    const preferredY = anchorY + zoneHeight * options.biasY;
    const innerMinX = bounds.minX + options.labelWidth * 0.45;
    const innerMaxX = bounds.maxX - options.labelWidth * 0.45;
    const innerMinY = bounds.minY + options.labelHeight * 0.45;
    const innerMaxY = bounds.maxY - options.labelHeight * 0.45;

    labelX = clamp(preferredX, Math.min(innerMinX, innerMaxX), Math.max(innerMinX, innerMaxX));
    labelY = clamp(preferredY, Math.min(innerMinY, innerMaxY), Math.max(innerMinY, innerMaxY));
  }

  return {
    labelX: clamp(labelX, marginX, dimensions.width - marginX),
    labelY: clamp(labelY, marginY, dimensions.height - marginY),
  };
}

export default function VideoPlayerTab({
  initialDir = "",
  initialPoints = [],
  initialMasks = [],
  prefetchedDir = "",
  surgicalWorkspace = false,
  initialShowOverlay = true,
  initialShowFullLabels = false,
  initialShowToolZones = false,
  guidanceMode = "both",
  overlayColors = {
    target: "#16A34A",
    avoid: "#F59E0B",
    danger: "#EF4444",
  },
  targetIconStyle = "reticle",
}: VideoPlayerTabProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  const [dirPath, setDirPath] = useState(initialDir);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [framePoints, setFramePoints] = useState<FramePoints[]>([]);
  const [frameRleMasks, setFrameRleMasks] = useState<FrameRleMasks[]>([]);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(initialShowOverlay);
  const [showTargetZone, setShowTargetZone] = useState(true);
  const [showDangerZone, setShowDangerZone] = useState(true);
  const [showToolZones, setShowToolZones] = useState(initialShowToolZones);
  const [showZoneLabels, setShowZoneLabels] = useState(true);
  const [showFullLabels, setShowFullLabels] = useState(initialShowFullLabels);
  const [fps, setFps] = useState(18);
  const [currentFrame, setCurrentFrame] = useState("");
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [mediaRect, setMediaRect] = useState<MediaRect>({ left: 0, top: 0, width: 0, height: 0 });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentZoneNames, setCurrentZoneNames] = useState<Set<string>>(new Set());
  const objectUrlRef = useRef<string | null>(null);
  const masksCanvasRef = useRef<HTMLCanvasElement>(null);
  const linesCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastMaskFrameIndexRef = useRef<number>(-1);
  const lastLinesFrameIndexRef = useRef<number>(-1);
  const linesAnimManagerRef = useRef(new BoundaryAnimationManager());
  const [showMasks, setShowMasks] = useState(false);
  const [showLines, setShowLines] = useState(true);
  const [showToolbars, setShowToolbars] = useState(!surgicalWorkspace);
  const [focusMode, setFocusMode] = useState(false);
  const [isMouseOverVideo, setIsMouseOverVideo] = useState(false);
  const [legendHidden, setLegendHidden] = useState(false);
  const [hoveredZoneName, setHoveredZoneName] = useState<string | null>(null);
  const [pinnedZoneName, setPinnedZoneName] = useState<string | null>(null);

  const detectedZones = useMemo((): Zone[] => {
    if (framePoints.length === 0) return [];
    const s = new Set<string>();
    for (const f of framePoints) for (const z of f.zones) s.add(z.label);
    const entries = Array.from(s).map(l => createClassifiedZone(l));
    entries.sort((a, b) => a.id.localeCompare(b.id));
    return entries;
  }, [framePoints]);

  const currentFrameIndex = useMemo(() => {
    if (framePoints.length === 0) return 0;
    return timeToFrameIndex(currentTime, fps, framePoints.length);
  }, [currentTime, fps, framePoints.length]);

  const currentEntry = useMemo(() => {
    if (framePoints.length === 0) return null;
    return framePoints[currentFrameIndex] ?? null;
  }, [framePoints, currentFrameIndex]);

  const currentZoneMap = useMemo(() => {
    const map = new Map<string, BoundaryZone>();
    for (const zone of currentEntry?.zones ?? []) map.set(zone.label, zone);
    return map;
  }, [currentEntry]);

  const overlaySize = useMemo(
    () => ({
      width: mediaRect.width || dimensions.width,
      height: mediaRect.height || dimensions.height,
    }),
    [dimensions.height, dimensions.width, mediaRect.height, mediaRect.width]
  );

  const targetBounds = useMemo(() => getLargestZoneBounds(currentZoneMap.get("Aortic root")), [currentZoneMap]);
  const targetPixelBounds = useMemo(
    () => getZonePixelBounds(currentZoneMap.get("Aortic root"), overlaySize),
    [currentZoneMap, overlaySize]
  );
  const avoidPixelBounds = useMemo(
    () => getZonePixelBounds(currentZoneMap.get("Auricles"), overlaySize),
    [currentZoneMap, overlaySize]
  );
  const cautionPixelBounds = useMemo(
    () => getZonePixelBounds(currentZoneMap.get("Epicardial fat on aortic"), overlaySize),
    [currentZoneMap, overlaySize]
  );
  const grasperPixelBounds = useMemo(
    () => getZonePixelBounds(currentZoneMap.get("Grasper"), overlaySize),
    [currentZoneMap, overlaySize]
  );
  const needlePixelBounds = useMemo(
    () => getZonePixelBounds(currentZoneMap.get("Needle holders"), overlaySize),
    [currentZoneMap, overlaySize]
  );
  const targetAnchor = useMemo(() => getZoneAnchor(currentZoneMap.get("Aortic root")), [currentZoneMap]);
  const avoidAnchor = useMemo(() => getZoneAnchor(currentZoneMap.get("Auricles")), [currentZoneMap]);
  const cautionAnchor = useMemo(() => getZoneAnchor(currentZoneMap.get("Epicardial fat on aortic")), [currentZoneMap]);
  const grasperAnchor = useMemo(() => getZoneAnchor(currentZoneMap.get("Grasper")), [currentZoneMap]);
  const needleAnchor = useMemo(() => getZoneAnchor(currentZoneMap.get("Needle holders")), [currentZoneMap]);
  const targetLabelPosition = useMemo(
    () => getPinnedLabelPlacement(targetAnchor, targetPixelBounds, overlaySize, {
      biasX: 0.2,
      biasY: -0.12,
      labelWidth: showFullLabels ? 72 : 26,
      labelHeight: 18,
    }),
    [overlaySize, showFullLabels, targetAnchor, targetPixelBounds]
  );
  const cautionLabelPosition = useMemo(
    () => getPinnedLabelPlacement(cautionAnchor, cautionPixelBounds, overlaySize, {
      biasX: -0.08,
      biasY: 0.08,
      labelWidth: showFullLabels ? 142 : 24,
      labelHeight: 18,
    }),
    [cautionAnchor, cautionPixelBounds, overlaySize, showFullLabels]
  );
  const avoidLabelPosition = useMemo(
    () => getPinnedLabelPlacement(avoidAnchor, avoidPixelBounds, overlaySize, {
      biasX: 0.18,
      biasY: 0.18,
      labelWidth: showFullLabels ? 58 : 34,
      labelHeight: 18,
    }),
    [avoidAnchor, avoidPixelBounds, overlaySize, showFullLabels]
  );
  const grasperLabelPosition = useMemo(
    () => getPinnedLabelPlacement(grasperAnchor, grasperPixelBounds, overlaySize, {
      biasX: 0,
      biasY: 0,
      labelWidth: showFullLabels ? 56 : 28,
      labelHeight: 18,
    }),
    [grasperAnchor, grasperPixelBounds, overlaySize, showFullLabels]
  );
  const needleLabelPosition = useMemo(
    () => getPinnedLabelPlacement(needleAnchor, needlePixelBounds, overlaySize, {
      biasX: 0,
      biasY: 0,
      labelWidth: showFullLabels ? 94 : 28,
      labelHeight: 18,
    }),
    [needleAnchor, needlePixelBounds, overlaySize, showFullLabels]
  );
  const activeZoneName = hoveredZoneName ?? pinnedZoneName;
  const jb = "font-[family-name:var(--font-geist-mono)]";

  // ── Data loading ────────────────────────────────────────────────────────

  const parsePoints = useCallback((records: BoundaryRecord[]) => {
    const parsed = records.map(rec => {
      const m = rec.image.match(/(\d+)/);
      return { frameNum: m ? parseInt(m[1], 10) : 0, zones: rec.zones, lines: rec.lines ?? [] };
    });
    parsed.sort((a, b) => a.frameNum - b.frameNum);
    return parsed;
  }, []);

  const parseRleMasks = useCallback((records: Array<{ image: string; tags: SegmentationTag[] }>) => {
    const parsed = records.map(rec => {
      const m = rec.image.match(/(\d+)/);
      return { frameNum: m ? parseInt(m[1], 10) : 0, tags: rec.tags };
    });
    parsed.sort((a, b) => a.frameNum - b.frameNum);
    return parsed;
  }, []);

  const loadFromServer = useCallback(async () => {
    setLoading(true); setError(null); setPlaying(false); revokeObjectUrl();
    try {
      const check = await fetch("/api/video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dir: dirPath }) });
      const info = await check.json();
      if (!check.ok) throw new Error(info.error || "Cannot access directory");
      if (!info.hasVideo) throw new Error("footage.mp4 not found");
      const canUsePrefetchedData =
        prefetchedDir.trim() &&
        prefetchedDir.trim() === dirPath.trim();

      if (canUsePrefetchedData && initialPoints.length > 0) {
        setFramePoints(parsePoints(initialPoints));
      } else {
        const pr = await fetch(`/api/points?dir=${encodeURIComponent(dirPath)}`);
        const pd = await pr.json();
        if (Array.isArray(pd)) setFramePoints(parsePoints(pd));
      }

      if (info.hasMasks) {
        if (canUsePrefetchedData && initialMasks.length > 0) {
          setFrameRleMasks(parseRleMasks(initialMasks));
        } else {
          try {
            const r = await fetch(`/api/masks?dir=${encodeURIComponent(dirPath)}`);
            if (r.ok) {
              const d = await r.json();
              setFrameRleMasks(Array.isArray(d) ? parseRleMasks(d) : []);
            } else {
              setFrameRleMasks([]);
            }
          } catch {
            setFrameRleMasks([]);
          }
        }
      } else {
        setFrameRleMasks([]);
      }
      setVideoSrc(`/api/video?dir=${encodeURIComponent(dirPath)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setVideoSrc(null);
      setFramePoints([]);
      setFrameRleMasks([]);
    } finally {
      setLoading(false);
    }
  }, [dirPath, initialMasks, initialPoints, parsePoints, parseRleMasks, prefetchedDir]);

  const loadFromPicker = useCallback(async () => {
    if (!("showDirectoryPicker" in window)) {
      alert("Use Chrome or Edge.");
      return;
    }
    try {
      const dh = await (window as any).showDirectoryPicker({ mode: "read" });
      setLoading(true); setError(null); setPlaying(false); revokeObjectUrl();
      let vh: FileSystemFileHandle | null = null;
      let ph: FileSystemFileHandle | null = null;
      let mh: FileSystemFileHandle | null = null;
      for await (const [name, handle] of dh.entries()) {
        if (handle.kind !== "file") continue;
        if (name === "footage.mp4") vh = handle;
        if (name === "points.json") ph = handle;
        if (name === "masks.json") mh = handle;
      }
      if (!vh) throw new Error("footage.mp4 not found");
      if (!ph) throw new Error("points.json not found");
      const pf = await ph.getFile();
      const records = JSON.parse(await pf.text());
      if (Array.isArray(records)) setFramePoints(parsePoints(records));
      const vf = await vh.getFile();
      const url = URL.createObjectURL(vf);
      objectUrlRef.current = url;
      setVideoSrc(url);
      setDirPath(dh.name);
      if (mh) {
        try {
          const rf = await mh.getFile();
          const rd = JSON.parse(await rf.text());
          setFrameRleMasks(Array.isArray(rd) ? parseRleMasks(rd) : []);
        } catch {
          setFrameRleMasks([]);
        }
      } else {
        setFrameRleMasks([]);
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Failed");
        setFrameRleMasks([]);
      }
    } finally {
      setLoading(false);
    }
  }, [parsePoints, parseRleMasks]);

  function revokeObjectUrl() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }

  const updateMediaRect = useCallback(() => {
    const container = containerRef.current;
    if (!container || dimensions.width <= 0 || dimensions.height <= 0) return;
    setMediaRect(
      getContainedMediaRect(
        container.clientWidth,
        container.clientHeight,
        dimensions.width,
        dimensions.height,
      )
    );
  }, [dimensions.height, dimensions.width]);

  useEffect(() => () => revokeObjectUrl(), []);
  useEffect(() => { if (dirPath?.trim()) loadFromServer(); }, []); // eslint-disable-line
  useEffect(() => { updateMediaRect(); }, [updateMediaRect]);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => updateMediaRect());
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateMediaRect]);

  const handleVideoLoaded = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setDimensions({ width: v.videoWidth, height: v.videoHeight });
    setDuration(v.duration);
  }, []);

  const getZonesForTime = useCallback((time: number): BoundaryZone[] | null => {
    if (framePoints.length === 0) return null;
    const idx = Math.min(Math.round(time * fps), framePoints.length - 1);
    return idx >= 0 ? framePoints[idx]?.zones ?? null : null;
  }, [framePoints, fps]);

  // ═══════════════════════════════════════════════════════════════════════
  // ── OVERLAY RENDER — MERGED ──
  //   • Border: glow + core sharp từ Code 1, ĐỔI THÀNH NÉT ĐỨT
  //   • Fill:   globalCompositeOperation = "overlay" từ Code 2 (tint mô, giữ highlight)
  //   • Màu:    AR xanh lá, EF cam, RA đỏ.
  // ═══════════════════════════════════════════════════════════════════════
  const renderOverlay = useCallback(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;

    c.width = dimensions.width || 1920;
    c.height = dimensions.height || 1080;

    const fi = Math.round(v.currentTime * fps);
    const entry = framePoints[Math.min(fi, framePoints.length - 1)];
    if (entry) {
      setCurrentFrame(`Frame ${entry.frameNum} (${fi + 1}/${framePoints.length})`);
      setCurrentZoneNames(new Set(entry.zones.map(z => z.label)));
    }

    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);

    if (!showOverlay) return;

    const zones = getZonesForTime(v.currentTime);
    if (!zones?.length) return;

    const targetZone = showTargetZone
      ? zones.find((z) => z.label === "Aortic root")
      : undefined;
    const backgroundZones = showDangerZone
      ? zones.filter((z) =>
          z.label === "Epicardial fat on aortic" || z.label === "Auricles"
        )
      : [];
    const toolZones = showToolZones
      ? zones.filter((z) => z.label === "Grasper" || z.label === "Needle holders")
      : [];

    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // scale cho nét đứt theo canvas
    const scale = c.width / 1920;
    const DASH: [number, number] = [6 * scale, 8 * scale];

    const drawZone = (zone: BoundaryZone, isTarget: boolean) => {
      const role = getRole(zone.label);
      const polys = normalizePolygons(zone.points);

      // Build path với moving-average smoothing (giữ dáng, mềm cạnh)
      const buildPath = () => {
        ctx.beginPath();
        polys.forEach(poly => {
          if (poly.length > 2) {
            const smoothed: { x: number; y: number }[] = [];
            for (let i = 0; i < poly.length; i++) {
              const prev = poly[(i - 1 + poly.length) % poly.length];
              const curr = poly[i];
              const next = poly[(i + 1) % poly.length];
              smoothed.push({
                x: (curr.x * 0.75 + prev.x * 0.125 + next.x * 0.125) * c.width,
                y: (curr.y * 0.75 + prev.y * 0.125 + next.y * 0.125) * c.height,
              });
            }
            ctx.moveTo(smoothed[0].x, smoothed[0].y);
            for (let i = 1; i < smoothed.length; i++) ctx.lineTo(smoothed[i].x, smoothed[i].y);
          } else {
            poly.forEach((p, i) => {
              if (i === 0) ctx.moveTo(p.x * c.width, p.y * c.height);
              else ctx.lineTo(p.x * c.width, p.y * c.height);
            });
          }
          ctx.closePath();
        });
      };

      // Màu theo role (giữ bộ từ Code 1)
      let glowColor = "rgba(255,255,255,0.8)";
      let coreColor = "rgba(255,255,255,0.95)";
      let fillColor = "rgba(255,255,255,0.15)";
      let shadowBoost = 1;

      if (isTarget) {
        glowColor = hexToRgba(overlayColors.target, 1);
        coreColor = "rgba(220, 252, 231, 0.98)";
        fillColor = hexToRgba(overlayColors.target, 0.34); // alpha cao hơn vì dùng overlay blend
        shadowBoost = 1.75;
      } else if (role === "caution") {
        glowColor = hexToRgba(overlayColors.avoid, 0.85);
        fillColor = hexToRgba(overlayColors.avoid, 0.18);
      } else if (role === "avoid") {
        glowColor = hexToRgba(overlayColors.danger, 0.98);
        coreColor = "rgba(254, 226, 226, 0.95)";
        fillColor = hexToRgba(overlayColors.danger, 0.26);
        shadowBoost = 1.28;
      } else if (zone.label === "Grasper") {
        glowColor = "rgba(59, 130, 246, 0.85)";
        fillColor = "rgba(59, 130, 246, 0.18)";
      } else if (zone.label === "Needle holders") {
        glowColor = "rgba(136, 238, 255, 0.85)";
        fillColor = "rgba(136, 238, 255, 0.18)";
      }

      const isActive = activeZoneName === zone.label;
      const isMuted = Boolean(activeZoneName) && !isActive;
      const activeMultiplier = isActive ? 1.45 : focusMode ? 1.08 : 1;
      const mutedAlpha = isMuted ? (focusMode ? 0.18 : 0.32) : focusMode ? 0.88 : 1;
      const fillAlphaMultiplier = focusMode ? (isTarget ? 0.72 : 0.52) : 1;

      // ── 1) FILL bằng OVERLAY blend mode (từ Code 2) ──
      // Nhuộm màu lên mô mà vẫn giữ được vệt sáng bóng của tissue
      buildPath();
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = mutedAlpha;
      ctx.fillStyle = fillColor;
      ctx.globalAlpha *= fillAlphaMultiplier;
      ctx.fill();
      ctx.restore();

      // ── 2) OUTER GLOW (nét đứt) ──
      buildPath();
      ctx.save();
      ctx.setLineDash(DASH);
      ctx.strokeStyle = glowColor;
      ctx.globalAlpha = mutedAlpha;
      ctx.lineWidth = (isTarget ? 5.5 : role === "avoid" ? 4.2 : 3) * scale * activeMultiplier;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 10 * scale * activeMultiplier * shadowBoost;
      ctx.stroke();
      ctx.restore();

      // ── 3) CORE sharp line (nét đứt, trắng sáng) ──
      buildPath();
      ctx.save();
      ctx.setLineDash(DASH);
      ctx.strokeStyle = coreColor;
      ctx.globalAlpha = mutedAlpha;
      ctx.lineWidth = (isTarget ? 2.35 : role === "avoid" ? 1.45 : 1.1) * scale * (isActive ? 1.25 : 1);
      ctx.shadowBlur = 0;
      ctx.stroke();
      ctx.restore();
    };

    // Thứ tự vẽ: background zones trước, target zone trên cùng
    backgroundZones.forEach(z => drawZone(z, false));
    toolZones.forEach(z => drawZone(z, false));
    if (targetZone) drawZone(targetZone, true);

  }, [activeZoneName, showDangerZone, showOverlay, showTargetZone, showToolZones, getZonesForTime, fps, framePoints, dimensions, focusMode, overlayColors]);

  const renderLinesOv = useCallback(() => {
    const v = videoRef.current;
    const c = linesCanvasRef.current;
    if (!c) return;
    if (!v || !videoSrc || !showLines || !framePoints.length) {
      if (lastLinesFrameIndexRef.current !== -1) {
        clearCanvas(c);
        lastLinesFrameIndexRef.current = -1;
      }
      return;
    }
    const idx = timeToFrameIndex(v.currentTime, fps, framePoints.length);
    if (idx === lastLinesFrameIndexRef.current) return;
    lastLinesFrameIndexRef.current = idx;
    const entry = framePoints[idx];
    if (!entry?.lines.length) {
      clearCanvas(c);
      linesAnimManagerRef.current.update(new Set(), v.currentTime);
      return;
    }
    linesAnimManagerRef.current.update(new Set(entry.lines.map(l => l.label)), v.currentTime);
    renderLinesOverlay(c, entry.lines, dimensions.width || 1920, dimensions.height || 1080, linesAnimManagerRef.current);
  }, [showLines, framePoints, fps, dimensions, videoSrc]);

  const renderMasksOv = useCallback(() => {
    const v = videoRef.current;
    const c = masksCanvasRef.current;
    if (!c) return;
    if (!v || !videoSrc || !showMasks || !frameRleMasks.length) {
      if (lastMaskFrameIndexRef.current !== -1) {
        clearCanvas(c);
        lastMaskFrameIndexRef.current = -1;
      }
      return;
    }
    const idx = timeToFrameIndex(v.currentTime, fps, frameRleMasks.length);
    if (idx === lastMaskFrameIndexRef.current) return;
    lastMaskFrameIndexRef.current = idx;
    const entry = frameRleMasks[idx];
    if (!entry?.tags.length) {
      clearCanvas(c);
      return;
    }
    renderSegmentationOverlay(c, entry.tags, dimensions.width || 1920, dimensions.height || 1080);
  }, [showMasks, frameRleMasks, fps, dimensions, videoSrc]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoSrc) return;
    let running = true;
    function tick() {
      if (!running) return;
      renderOverlay();
      renderMasksOv();
      renderLinesOv();
      if (v) setCurrentTime(v.currentTime);
      animFrameRef.current = requestAnimationFrame(tick);
    }
    tick();
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [videoSrc, renderOverlay, renderMasksOv, renderLinesOv]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }, []);

  const handleVideoEnded = useCallback(() => setPlaying(false), []);
  const handleLegendZonePin = useCallback((zoneName: string) => {
    setPinnedZoneName((current) => current === zoneName ? null : zoneName);
    const role = getRole(zoneName);
    if (role === "target") setShowTargetZone(true);
    if (role === "avoid" || role === "caution") setShowDangerZone(true);
  }, []);

  const targetIconColor = overlayColors.target;
  const targetIconFill = hexToRgba(overlayColors.target, 0.18);
  const targetIconShadow = `drop-shadow(0 0 9px ${targetIconColor})`;

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(6,15,24,0.98),rgba(5,11,18,0.95))]">
      {showToolbars && !surgicalWorkspace && (
        <div className="border-b border-white/[0.06] bg-[linear-gradient(180deg,rgba(6,15,24,0.97),rgba(5,11,18,0.94))] px-4 py-2.5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Video Player
          </span>

          <button
            onClick={loadFromPicker}
            disabled={loading}
            className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors whitespace-nowrap hover:bg-white/[0.08] hover:text-zinc-100 disabled:opacity-50"
          >
            Choose Folder…
          </button>

          {videoSrc && (
            <>
              <button
                onClick={() => setShowOverlay((v) => !v)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  showOverlay
                    ? "border-cyan-500 bg-cyan-500/20 text-cyan-300"
                    : "border-white/[0.08] bg-white/[0.035] text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100"
                }`}
              >
                {showOverlay ? "Hide Overlay" : "Show Overlay"}
              </button>

              {showOverlay && (
                <>
                  <button
                    onClick={() => setShowZoneLabels((v) => !v)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      showZoneLabels
                        ? "border-amber-500 bg-amber-500/20 text-amber-300"
                        : "border-white/[0.08] bg-white/[0.035] text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100"
                    }`}
                  >
                    {showZoneLabels ? "Hide Labels" : "Show Labels"}
                  </button>

                  {showZoneLabels && (
                    <button
                      onClick={() => setShowFullLabels((v) => !v)}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                        showFullLabels
                          ? "border-amber-500 bg-amber-500/20 text-amber-300"
                          : "border-white/[0.08] bg-white/[0.035] text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100"
                      }`}
                    >
                      {showFullLabels ? "Short Labels" : "Full Labels"}
                    </button>
                  )}

                  <button
                    onClick={() => setFocusMode((value) => !value)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      focusMode
                        ? "border-emerald-500 bg-emerald-500/18 text-emerald-300"
                        : "border-white/[0.08] bg-white/[0.035] text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100"
                    }`}
                  >
                    {focusMode ? "Disable Focus Mode" : "Enable Focus Mode"}
                  </button>

                  <button
                    onClick={() => setShowTargetZone((v) => !v)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      showTargetZone
                        ? "border-cyan-500 bg-cyan-500/20 text-cyan-300"
                        : "border-white/[0.08] bg-white/[0.035] text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100"
                    }`}
                  >
                    {showTargetZone ? "Hide Target Zone" : "Show Target Zone"}
                  </button>

                  <button
                    onClick={() => setShowDangerZone((v) => !v)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      showDangerZone
                        ? "border-rose-500 bg-rose-500/20 text-rose-300"
                        : "border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100"
                    }`}
                  >
                    {showDangerZone ? "Hide Danger Zone" : "Show Danger Zone"}
                  </button>

                  <button
                    onClick={() => setShowToolZones((v) => !v)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      showToolZones
                        ? "border-sky-500 bg-sky-500/20 text-sky-300"
                        : "border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100"
                    }`}
                  >
                    {showToolZones ? "Hide Tools" : "Show Tools"}
                  </button>
                </>
              )}

              {frameRleMasks.length > 0 && (
                <button
                  onClick={() => setShowMasks((v) => !v)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    showMasks
                      ? "border-violet-500 bg-violet-500/20 text-violet-300"
                      : "border-white/[0.08] bg-white/[0.035] text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100"
                  }`}
                >
                  {showMasks ? "Hide Masks" : "Show Masks"}
                </button>
              )}

              {framePoints.some((f) => f.lines.length > 0) && (
                <button
                  onClick={() => setShowLines((v) => !v)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    showLines
                      ? "border-orange-500 bg-orange-500/20 text-orange-300"
                      : "border-white/[0.08] bg-white/[0.035] text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100"
                  }`}
                >
                  {showLines ? "Hide Lines" : "Show Lines"}
                </button>
              )}

              <div className="ml-1 flex items-center gap-1 whitespace-nowrap rounded-xl border border-white/[0.08] bg-white/[0.035] px-2 py-1">
                <label className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">FPS</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={fps}
                  onChange={(e) => {
                    const next = parseInt(e.target.value, 10);
                    if (next > 0 && next <= 120) setFps(next);
                  }}
                  className="w-14 rounded-lg border border-white/[0.08] bg-black/30 px-1.5 py-0.5 text-center text-xs text-zinc-200 focus:border-zinc-500 focus:outline-none"
                />
              </div>
            </>
          )}

          <div className="ml-auto flex items-center gap-2 whitespace-nowrap">
            <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1 text-xs text-zinc-400">
              {currentFrame}
            </span>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1 text-xs text-zinc-500">
              {dimensions.width > 0 ? `${dimensions.width}×${dimensions.height}` : ""}
            </span>
          </div>
          </div>
        </div>
      )}

      {error && (
        <div className={`mx-4 mt-2 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-400 ${jb}`}>
          {error}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {!surgicalWorkspace && (
          <SideBar
            isOpen
            zones={detectedZones.filter(z => currentZoneNames.has(z.id))}
            legendHidden={legendHidden}
            hoveredZoneName={hoveredZoneName}
            pinnedZoneName={pinnedZoneName}
            onLegendToggle={() => setLegendHidden((value) => !value)}
            onZoneHover={setHoveredZoneName}
            onZonePin={handleLegendZonePin}
          />
        )}

        <div className="flex flex-1 flex-col overflow-hidden">
          {videoSrc ? (
            <div data-testid="video-export-stage" className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(12,30,42,0.42),rgba(4,8,12,0.94))]">
              {surgicalWorkspace && (
                <SurgicalAssistRail
                  playing={playing}
                  loading={loading}
                  guidanceMode={guidanceMode}
                  currentFrame={currentFrame}
                  currentTime={currentTime}
                  duration={duration}
                  showOverlay={showOverlay}
                  showZoneLabels={showZoneLabels}
                  showFullLabels={showFullLabels}
                  showTargetZone={showTargetZone}
                  showDangerZone={showDangerZone}
                  showToolZones={showToolZones}
                  showMasks={showMasks}
                  showLines={showLines}
                  hasMasks={frameRleMasks.length > 0}
                  hasLines={framePoints.some((f) => f.lines.length > 0)}
                  activeZones={detectedZones.filter(z => currentZoneNames.has(z.id))}
                  onPlayToggle={togglePlay}
                  onOverlayToggle={() => setShowOverlay((v) => !v)}
                  onLabelsToggle={() => setShowZoneLabels((v) => !v)}
                  onFullLabelsToggle={() => setShowFullLabels((v) => !v)}
                  onTargetToggle={() => setShowTargetZone((v) => !v)}
                  onDangerToggle={() => setShowDangerZone((v) => !v)}
                  onToolsToggle={() => setShowToolZones((v) => !v)}
                  onMasksToggle={() => setShowMasks((v) => !v)}
                  onLinesToggle={() => setShowLines((v) => !v)}
                />
              )}
              <div
                ref={containerRef}
                className={surgicalWorkspace ? "absolute inset-y-0 left-0 right-20 xl:right-24" : "absolute inset-0"}
                onMouseEnter={() => setIsMouseOverVideo(true)}
                onMouseLeave={() => setIsMouseOverVideo(false)}
              >
                <div
                  className="absolute"
                  style={{
                    left: mediaRect.left,
                    top: mediaRect.top,
                    width: mediaRect.width,
                    height: mediaRect.height,
                  }}
                >
                <video
                  ref={videoRef}
                  src={videoSrc}
                  className="absolute inset-0 h-full w-full object-fill bg-black"
                  onLoadedMetadata={handleVideoLoaded}
                  onEnded={handleVideoEnded}
                  onPause={() => setPlaying(false)}
                  onPlay={() => setPlaying(true)}
                  controls={false}
                  playsInline
                />

                <canvas ref={canvasRef} className="absolute inset-0 h-full w-full pointer-events-none" />
                <canvas ref={masksCanvasRef} className="absolute inset-0 h-full w-full pointer-events-none" />
                <canvas ref={linesCanvasRef} className="absolute inset-0 h-full w-full pointer-events-none" />

                {/* ── NHÃN CÔNG CỤ & CẢNH BÁO ── */}
                <div className={`absolute inset-0 z-[15] pointer-events-none ${jb}`}>
                  {showZoneLabels && showTargetZone && targetLabelPosition && (
                    <div
                      className="absolute"
                      style={{
                        left: targetLabelPosition.labelX,
                        top: targetLabelPosition.labelY,
                        transform: "translate(-50%, -50%)",
                      }}
                    >
                      <div className="rounded-[3px] bg-black/90 px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none text-white shadow-[0_1px_3px_rgba(0,0,0,0.75)]">
                        {showFullLabels ? "Aortic root" : "AR"}
                      </div>
                    </div>
                  )}

                  {showZoneLabels && showDangerZone && cautionLabelPosition && (
                    <div
                      className="absolute"
                      style={{
                        left: cautionLabelPosition.labelX,
                        top: cautionLabelPosition.labelY,
                        transform: "translate(-50%, -50%)",
                      }}
                    >
                      <div className="rounded-[3px] bg-black/90 px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none text-white shadow-[0_1px_3px_rgba(0,0,0,0.75)]">
                        {showFullLabels ? "Epicardial fat on aortic" : "EF"}
                      </div>
                    </div>
                  )}

                  {showZoneLabels && showDangerZone && avoidLabelPosition && (
                     <div
                       className="absolute"
                       style={{
                         left: avoidLabelPosition.labelX,
                         top: avoidLabelPosition.labelY,
                         transform: "translate(-50%, -50%)",
                       }}
                     >
                      <div className="rounded-[3px] bg-black/90 px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none text-white shadow-[0_1px_3px_rgba(0,0,0,0.75)]">
                        {showFullLabels ? "Right atrium" : "RA"}
                      </div>
                    </div>
                  )}

                  {showZoneLabels && showToolZones && grasperLabelPosition && (
                    <div
                      className="absolute"
                      style={{
                        left: grasperLabelPosition.labelX,
                        top: grasperLabelPosition.labelY,
                        transform: "translate(-50%, -50%)",
                      }}
                    >
                      <div className="rounded-[3px] bg-black/90 px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none text-white shadow-[0_1px_3px_rgba(0,0,0,0.75)]">
                        {showFullLabels ? "Grasper" : "GR"}
                      </div>
                    </div>
                  )}

                  {showZoneLabels && showToolZones && needleLabelPosition && (
                    <div
                      className="absolute"
                      style={{
                        left: needleLabelPosition.labelX,
                        top: needleLabelPosition.labelY,
                        transform: "translate(-50%, -50%)",
                      }}
                    >
                      <div className="rounded-[3px] bg-black/90 px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none text-white shadow-[0_1px_3px_rgba(0,0,0,0.75)]">
                        {showFullLabels ? "Needle holders" : "NH"}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── VÒNG NGẮM AR (RETICLE) ── */}
                {showTargetZone && dimensions.width > 0 && dimensions.height > 0 && (
                  <svg className="pointer-events-none absolute inset-0 z-[12] h-full w-full" viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} preserveAspectRatio="xMidYMid meet">
                    {targetBounds && (
                      <g transform={`translate(${targetBounds.cx * dimensions.width}, ${targetBounds.cy * dimensions.height})`}>
                        {targetIconStyle === "pulse" ? (
                          <>
                            <circle r="18" fill={targetIconFill} stroke={targetIconColor} strokeWidth="2.4" style={{ filter: targetIconShadow }}>
                              <animate attributeName="r" values="16;34;16" dur="1.8s" repeatCount="indefinite" />
                              <animate attributeName="opacity" values="0.95;0.18;0.95" dur="1.8s" repeatCount="indefinite" />
                            </circle>
                            <circle r="7" fill="#dcfce7" stroke={targetIconColor} strokeWidth="2.2" />
                          </>
                        ) : targetIconStyle === "crosshair" ? (
                          <>
                            <circle r="18" fill="none" stroke={targetIconColor} strokeWidth="2.2" strokeDasharray="5 6" style={{ filter: targetIconShadow }} />
                            <line x1="-42" y1="0" x2="-10" y2="0" stroke={targetIconColor} strokeWidth="3" strokeLinecap="round" />
                            <line x1="10" y1="0" x2="42" y2="0" stroke={targetIconColor} strokeWidth="3" strokeLinecap="round" />
                            <line x1="0" y1="-42" x2="0" y2="-10" stroke={targetIconColor} strokeWidth="3" strokeLinecap="round" />
                            <line x1="0" y1="10" x2="0" y2="42" stroke={targetIconColor} strokeWidth="3" strokeLinecap="round" />
                            <circle r="3.8" fill="#dcfce7" />
                          </>
                        ) : (
                          <>
                            <circle r="22" fill={targetIconFill} stroke={targetIconColor} strokeWidth="2.4" style={{ filter: targetIconShadow }}>
                              <animate attributeName="r" values="20;24;20" dur="2.2s" repeatCount="indefinite" />
                              <animate attributeName="opacity" values="0.95;0.62;0.95" dur="2.2s" repeatCount="indefinite" />
                            </circle>
                            <circle r="12" fill="none" stroke="#dcfce7" strokeWidth="1.6" opacity="0.95">
                              <animate attributeName="r" values="10;13;10" dur="2.2s" repeatCount="indefinite" />
                            </circle>
                            <line x1="-36" y1="0" x2="-16" y2="0" stroke={targetIconColor} strokeWidth="3" strokeLinecap="round" />
                            <line x1="16" y1="0" x2="36" y2="0" stroke={targetIconColor} strokeWidth="3" strokeLinecap="round" />
                            <line x1="0" y1="-36" x2="0" y2="-16" stroke={targetIconColor} strokeWidth="3" strokeLinecap="round" />
                            <line x1="0" y1="16" x2="0" y2="36" stroke={targetIconColor} strokeWidth="3" strokeLinecap="round" />
                            <circle r="5.2" fill="#dcfce7" stroke={targetIconColor} strokeWidth="2.2" style={{ filter: targetIconShadow }} />
                            <circle r="1.8" fill="#052e16" />
                          </>
                        )}
                      </g>
                    )}
                  </svg>
                )}
                </div>

                {/* ── NÚT PLAY/PAUSE ── */}
                {isMouseOverVideo && (
                  <button onClick={togglePlay} className="absolute inset-0 flex items-center justify-center bg-transparent group z-[50]">
                    <div className={`flex h-16 w-16 items-center justify-center rounded-full text-white transition-all duration-200 ${playing ? "opacity-0 group-hover:opacity-40 bg-black/40" : "opacity-70 group-hover:opacity-100 group-hover:scale-110 bg-black/60"}`} style={{ backdropFilter: "blur(4px)" }}>
                      {playing ? (
                         <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                      ) : (
                         <svg className="ml-1 h-7 w-7" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" /></svg>
                      )}
                    </div>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_top,rgba(12,30,42,0.34),rgba(5,11,18,0.98))]">
              {loading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-900 border-t-cyan-400" />
                  <p className={`text-[11px] uppercase tracking-widest text-zinc-500 ${jb}`}>Loading system…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/[0.04] bg-white/[0.02]">
                    <svg className="h-8 w-8 text-zinc-700" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                  </div>
                  <p className={`text-[11px] uppercase tracking-widest text-zinc-500 ${jb}`}>System Idle - Please open a workspace</p>
                </div>
              )}
            </div>
          )}

          {videoSrc && showToolbars && !surgicalWorkspace && (
            <div className="flex items-center gap-3 border-t border-white/[0.06] bg-[linear-gradient(180deg,rgba(6,15,24,0.94),rgba(5,11,18,0.97))] px-4 py-2.5 backdrop-blur-xl">
              <button
                onClick={togglePlay}
                className={`rounded-xl border px-4 py-1.5 text-sm font-semibold transition-colors ${
                  playing
                    ? "border-cyan-500 bg-cyan-500/18 text-cyan-300 hover:bg-cyan-500/28"
                    : "border-white/[0.08] bg-white/[0.035] text-zinc-300 hover:bg-white/[0.07]"
                }`}
              >
                {playing ? "⏸ Pause" : "▶ Play"}
              </button>

              <input
                type="range"
                min={0}
                max={duration}
                step={0.01}
                value={currentTime}
                onChange={(e) => {
                  const t = parseFloat(e.target.value);
                  if (videoRef.current) {
                    videoRef.current.currentTime = t;
                  }
                  setCurrentTime(t);
                }}
                className="flex-1 h-1 accent-zinc-400"
              />

              <span className="min-w-20 whitespace-nowrap text-right text-xs tabular-nums text-zinc-500">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function SurgicalAssistRail({
  playing,
  loading,
  guidanceMode,
  currentFrame,
  currentTime,
  duration,
  showOverlay,
  showZoneLabels,
  showFullLabels,
  showTargetZone,
  showDangerZone,
  showToolZones,
  showMasks,
  showLines,
  hasMasks,
  hasLines,
  activeZones,
  onPlayToggle,
  onOverlayToggle,
  onLabelsToggle,
  onFullLabelsToggle,
  onTargetToggle,
  onDangerToggle,
  onToolsToggle,
  onMasksToggle,
  onLinesToggle,
}: {
  playing: boolean;
  loading: boolean;
  guidanceMode: "voice" | "text" | "both";
  currentFrame: string;
  currentTime: number;
  duration: number;
  showOverlay: boolean;
  showZoneLabels: boolean;
  showFullLabels: boolean;
  showTargetZone: boolean;
  showDangerZone: boolean;
  showToolZones: boolean;
  showMasks: boolean;
  showLines: boolean;
  hasMasks: boolean;
  hasLines: boolean;
  activeZones: Zone[];
  onPlayToggle: () => void;
  onOverlayToggle: () => void;
  onLabelsToggle: () => void;
  onFullLabelsToggle: () => void;
  onTargetToggle: () => void;
  onDangerToggle: () => void;
  onToolsToggle: () => void;
  onMasksToggle: () => void;
  onLinesToggle: () => void;
}) {
  const zoneNames = activeZones.map((zone) => zone.name);
  const dangerInView = zoneNames.some((name) => name === "Auricles" || name === "Aortic root");
  const guidanceText = dangerInView
    ? "Critical anatomy visible. Maintain target and danger overlays."
    : "Guidance standing by.";

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-20 flex-col border-l border-white/[0.08] bg-[#050910]/92 p-2 backdrop-blur-xl xl:w-24">
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={onPlayToggle}
          title={playing ? "Pause" : "Play"}
          className="flex h-10 w-10 items-center justify-center rounded border border-cyan-300/25 bg-cyan-300/12 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/20"
        >
          {playing ? "II" : "▶"}
        </button>
        <RailButton label="OV" title="Overlay" active={showOverlay} onClick={onOverlayToggle} />
        <RailButton label="TG" title="Target Zone" active={showTargetZone} onClick={onTargetToggle} />
        <RailButton label="DZ" title="Danger Zone" active={showDangerZone} onClick={onDangerToggle} />
        <RailButton label="TL" title="Tools" active={showToolZones} onClick={onToolsToggle} />
        <RailButton label="LB" title="Labels" active={showZoneLabels} onClick={onLabelsToggle} />
        <RailButton label="FN" title="Full Labels" active={showFullLabels} onClick={onFullLabelsToggle} />
        {hasMasks && <RailButton label="MS" title="Masks" active={showMasks} onClick={onMasksToggle} />}
        {hasLines && <RailButton label="LN" title="Lines" active={showLines} onClick={onLinesToggle} />}
      </div>

      <div className="mt-3 flex flex-1 flex-col justify-between gap-3 overflow-hidden">
        <div className="space-y-2">
          <div className="rounded border border-white/[0.08] bg-white/[0.035] px-2 py-2 text-center">
            <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-500">AI</div>
            <div className="mt-1 text-[10px] capitalize text-zinc-200">{guidanceMode}</div>
          </div>
          {(guidanceMode === "text" || guidanceMode === "both") && (
            <div className="rounded border border-emerald-300/15 bg-emerald-300/8 px-2 py-2 text-[10px] leading-4 text-emerald-100">
              {guidanceText}
            </div>
          )}
          <div className="rounded border border-white/[0.08] bg-white/[0.035] px-2 py-2 text-center">
            <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-500">Zones</div>
            <div className="mt-1 text-sm font-semibold text-zinc-100">{activeZones.length}</div>
          </div>
        </div>

        <div className="space-y-2 text-center">
          <div className="text-[10px] text-zinc-500">{currentFrame || (loading ? "Loading" : "Ready")}</div>
          <div className="text-[10px] tabular-nums text-zinc-400">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>
      </div>
    </aside>
  );
}

function RailButton({
  label,
  title,
  active,
  onClick,
}: {
  label: string;
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={`${active ? "Hide" : "Show"} ${title}`}
      onClick={onClick}
      className={`flex h-9 w-10 items-center justify-center rounded border text-[10px] font-semibold transition-colors ${
        active
          ? "border-emerald-300/30 bg-emerald-300/12 text-emerald-100"
          : "border-white/[0.08] bg-white/[0.035] text-zinc-500 hover:bg-white/[0.07] hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}
