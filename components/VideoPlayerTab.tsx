"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  renderBoundaryOverlay,
  renderLinesOverlay,
  BoundaryZone,
  BoundaryRecord,
  LineAnnotation,
} from "@/lib/boundaryOverlay";
import {
  renderSegmentationOverlay,
  SegmentationTag,
} from "@/lib/segmentationOverlay";
import { getColor, type MaskColor } from "@/lib/ImageTools";
import SideBar from "@/components/SideBar";
import { Zone } from "@/lib/types";
import { BoundaryAnimationManager } from "@/lib/BoundaryAnimationManager";
import { createClassifiedZone } from "@/lib/ZoneFactory";

interface FramePoints {
  /** frame number extracted from image name */
  frameNum: number;
  zones: BoundaryZone[];
  lines: LineAnnotation[];
}

interface FrameRleMasks {
  frameNum: number;
  tags: SegmentationTag[];
}

interface VideoPlayerTabProps {
  initialDir?: string;
  initialPoints?: BoundaryRecord[];
  initialMasks?: Array<{ image: string; tags: SegmentationTag[] }>;
  prefetchedDir?: string;
}

// ── Canvas / frame utilities ────────────────────────────────────────────────────────

/**
 * Converts a video timestamp to a clamped integer index into a frame array.
 * Clamps to [0, count−1] so callers never receive an out-of-bounds result.
 */
function timeToFrameIndex(currentTime: number, fps: number, count: number): number {
  return Math.min(Math.max(Math.round(currentTime * fps), 0), count - 1);
}

/** Clears all pixels on a canvas element. */
function clearCanvas(canvas: HTMLCanvasElement): void {
  canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
}

export default function VideoPlayerTab({
  initialDir = "",
  initialPoints = [],
  initialMasks = [],
  prefetchedDir = "",
}: VideoPlayerTabProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  const dirPath = initialDir;
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [framePoints, setFramePoints] = useState<FramePoints[]>([]);
  const [frameRleMasks, setFrameRleMasks] = useState<FrameRleMasks[]>([]);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [showFullLabels, setShowFullLabels] = useState(false);
  const [fps, setFps] = useState(18);
  const [currentFrame, setCurrentFrame] = useState<string>("");
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentZoneNames, setCurrentZoneNames] = useState<Set<string>>(new Set());
  const objectUrlRef = useRef<string | null>(null);
  const masksCanvasRef = useRef<HTMLCanvasElement>(null);
  const linesCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastMaskFrameIndexRef = useRef<number>(-1);
  const lastLinesFrameIndexRef = useRef<number>(-1);
  const animManagerRef = useRef(new BoundaryAnimationManager());
  const linesAnimManagerRef = useRef(new BoundaryAnimationManager());

  const [showMasks, setShowMasks] = useState(false);
  const [showLines, setShowLines] = useState(true);
  const [showToolbars, setShowToolbars] = useState(true);
  const [isMouseOverVideo, setIsMouseOverVideo] = useState(false);

  // Derive Zone[] from all frame masks for SideBar.
  // Collect unique zone names and sort them alphabetically by name.
  const detectedZones = useMemo((): Zone[] => {
    if (framePoints.length === 0) return [];
    const pointsSet = new Set<string>();
    for (const frame of framePoints) {
      for (const zone of frame.zones) {
        pointsSet.add(zone.label);
      }
    }
    const entries = Array.from(pointsSet).map((label) => createClassifiedZone(label));
    entries.sort((a, b) => a.id.localeCompare(b.id));
    return entries;
  }, [framePoints]);

  // Parses points.json records into FrameMasks sorted by frame number.
  // Extracts the first integer from each image filename as the frame index.
  const parsePoints = useCallback((records: BoundaryRecord[]) => {
    const parsed: FramePoints[] = records.map((rec) => {
      const match = rec.image.match(/(\d+)/);
      const frameNum = match ? parseInt(match[1], 10) : 0;
      return { frameNum, zones: rec.zones, lines: rec.lines ?? [] };
    });
    parsed.sort((a, b) => a.frameNum - b.frameNum);
    return parsed;
  }, []);

  // Parses masks.json (RLE segmentation) records into FrameRleMasks sorted
  // by frame number, using the same filename-to-frame-number extraction.
  const parseRleMasks = useCallback(
    (records: Array<{ image: string; tags: SegmentationTag[] }>) => {
      const parsed: FrameRleMasks[] = records.map((rec) => {
        const match = rec.image.match(/(\d+)/);
        const frameNum = match ? parseInt(match[1], 10) : 0;
        return { frameNum, tags: rec.tags };
      });
      parsed.sort((a, b) => a.frameNum - b.frameNum);
      return parsed;
    },
    []
  );

  // Loads video and annotation data for the selected repo-backed directory via the
  // Next.js server API.  Checks the directory first, then streams
  // points.json, the optional masks.json, and sets the video source
  // to the streaming endpoint so the browser never has to buffer the whole file.
  const loadFromServer = useCallback(async (targetDir: string) => {
    setLoading(true);
    setError(null);
    setPlaying(false);
    revokeObjectUrl();

    try {
      // Check directory
      const check = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dir: targetDir }),
      });
      const info = await check.json();

      if (!check.ok) throw new Error(info.error || "Cannot access directory");
      if (!info.hasVideo) throw new Error("footage.mp4 not found in directory");
      // if (!info.hasMasks) throw new Error("masks_points.json not found in directory");

      const canUsePrefetchedData =
        prefetchedDir.trim() &&
        prefetchedDir.trim() === targetDir.trim();

      if (canUsePrefetchedData && initialPoints.length > 0) {
        setFramePoints(parsePoints(initialPoints));
      } else {
        const pointsRes = await fetch(
          `/api/points?dir=${encodeURIComponent(targetDir)}`
        );
        const pointsData = await pointsRes.json();
        if (Array.isArray(pointsData)) {
          setFramePoints(parsePoints(pointsData));
        }
      }

      if (info.hasMasks) {
        if (canUsePrefetchedData && initialMasks.length > 0) {
          setFrameRleMasks(parseRleMasks(initialMasks));
        } else {
          try {
            const rleRes = await fetch(
              `/api/masks?dir=${encodeURIComponent(targetDir)}`
            );
            if (rleRes.ok) {
              const rleData = await rleRes.json();
              setFrameRleMasks(Array.isArray(rleData) ? parseRleMasks(rleData) : []);
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

      // Set video source (streamed from API)
      setVideoSrc(
        `/api/video?dir=${encodeURIComponent(targetDir)}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setVideoSrc(null);
      setFramePoints([]);
      setFrameRleMasks([]);
    } finally {
      setLoading(false);
    }
  }, [initialMasks, initialPoints, parsePoints, parseRleMasks, prefetchedDir]);

  // Loads video and annotation data by opening a native directory picker
  // (Chrome/Edge File System Access API).  Creates an object URL for the video
  // file so playback works without routing through the server API.
  const loadFromPicker = useCallback(async () => {
    if (!("showDirectoryPicker" in window)) {
      alert("Folder picker not supported. Use Chrome or Edge.");
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dirHandle = await (window as any).showDirectoryPicker({ mode: "read" });
      setLoading(true);
      setError(null);
      setPlaying(false);
      revokeObjectUrl();

      let videoHandle: FileSystemFileHandle | null = null;
      let pointsHandle: FileSystemFileHandle | null = null;
      let rleMasksHandle: FileSystemFileHandle | null = null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const [name, handle] of (dirHandle as any).entries()) {
        if (handle.kind !== "file") continue;
        if (name === "footage.mp4") videoHandle = handle;
        if (name === "points.json") pointsHandle = handle;
        if (name === "masks.json") rleMasksHandle = handle;
      }

      if (!videoHandle) throw new Error("footage.mp4 not found in directory");
      if (!pointsHandle) throw new Error("points.json not found in directory");

      // Load masks
      const pointsFile = await pointsHandle.getFile();
      const text = await pointsFile.text();
      const records = JSON.parse(text);
      if (Array.isArray(records)) {
        setFramePoints(parsePoints(records));
      }

      // Load video
      const videoFile = await videoHandle.getFile();
      const url = URL.createObjectURL(videoFile);
      objectUrlRef.current = url;
      setVideoSrc(url);

      // Load RLE masks (optional)
      if (rleMasksHandle) {
        try {
          const rleFile = await rleMasksHandle.getFile();
          const rleText = await rleFile.text();
          const rleRecords = JSON.parse(rleText);
          setFrameRleMasks(Array.isArray(rleRecords) ? parseRleMasks(rleRecords) : []);
        } catch {
          setFrameRleMasks([]);
        }
      } else {
        setFrameRleMasks([]);
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Failed to load");
        setFrameRleMasks([]);
      }
    } finally {
      setLoading(false);
    }
  }, [parsePoints, parseRleMasks]);

  /** Revokes the current video object URL (if any) to free memory. */
  function revokeObjectUrl() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }

  useEffect(() => () => revokeObjectUrl(), []);

  useEffect(() => {
    lastLinesFrameIndexRef.current = -1;
  }, [showFullLabels]);

  // Auto-load from the default directory on mount.
  useEffect(() => {
    if (dirPath && dirPath.trim()) {
      loadFromServer(dirPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Stores video dimensions and duration once the metadata has loaded. */
  const handleVideoLoaded = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    setDimensions({
      width: video.videoWidth,
      height: video.videoHeight,
    });
    setDuration(video.duration);
  }, []);

  // Returns the zone array for the frame closest to the given playback time.
  // Returns null when no point data is loaded.
  const getZonesForTime = useCallback(
    (time: number): BoundaryZone[] | null => {
      if (framePoints.length === 0) return null;

      const frameIndex = Math.round(time * fps);
      const idx = Math.min(frameIndex, framePoints.length - 1);
      if (idx < 0) return null;

      return framePoints[idx]?.zones ?? null;
    },
    [framePoints, fps]
  );

  // Draws the boundary-zone overlay on `canvasRef` for the current video frame.
  // Also keeps the frame counter and visible-zone name set up to date on every
  // call, even when the overlay is hidden, so the side-bar reflects live state.
  const renderOverlay = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Always update frame counter and zone names regardless of overlay visibility
    const frameIndex = Math.round(video.currentTime * fps);
    const entry = framePoints[Math.min(frameIndex, framePoints.length - 1)];
    if (entry) {
      setCurrentFrame(`Frame ${entry.frameNum} (${frameIndex + 1}/${framePoints.length})`);
      setCurrentZoneNames(new Set(entry.zones.map((z) => z.label)));
    }

    if (!showOverlay) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const zones = getZonesForTime(video.currentTime);
    if (!zones || zones.length === 0) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      animManagerRef.current.update(new Set(), video.currentTime);
      return;
    }

    // Feed the animation manager and get per-zone render hints
    const visibleLabels = new Set(zones.map((z) => z.label));
    animManagerRef.current.update(visibleLabels, video.currentTime);

    renderBoundaryOverlay(
      canvas,
      zones,
      dimensions.width || 1920,
      dimensions.height || 1080,
      animManagerRef.current,
      showSafeZones,
      false,
      !showFullLabels,
    );
  }, [showOverlay, getZonesForTime, dimensions, fps, framePoints, showSafeZones, showFullLabels]);

  // Draws line annotations onto `linesCanvasRef` for the current frame.
  // Skips the render when the frame index has not changed since the last call
  // to avoid redundant work during the rAF loop.
  const renderLinesOverlayCallback = useCallback(() => {
    const video = videoRef.current;
    const canvas = linesCanvasRef.current;
    if (!canvas) return;

    if (!video || !videoSrc || !showLines || framePoints.length === 0) {
      if (lastLinesFrameIndexRef.current !== -1) {
        clearCanvas(canvas);
        lastLinesFrameIndexRef.current = -1;
      }
      return;
    }

    const idx = timeToFrameIndex(video.currentTime, fps, framePoints.length);
    if (idx === lastLinesFrameIndexRef.current) return;
    lastLinesFrameIndexRef.current = idx;

    const entry = framePoints[idx];
    if (!entry || entry.lines.length === 0) {
      clearCanvas(canvas);
      linesAnimManagerRef.current.update(new Set(), video.currentTime);
      return;
    }

    const visibleLineLabels = new Set(entry.lines.map((l) => l.label));
    linesAnimManagerRef.current.update(visibleLineLabels, video.currentTime);
    renderLinesOverlay(
      canvas,
      entry.lines,
      dimensions.width || 1920,
      dimensions.height || 1080,
      linesAnimManagerRef.current,
      !showFullLabels,
    );
  }, [showLines, framePoints, fps, dimensions, videoSrc, showFullLabels]);

  // Draws RLE segmentation masks onto `masksCanvasRef` for the current frame.
  // Same skip-if-unchanged optimisation as renderLinesOverlayCallback.
  const renderMasksOverlay = useCallback(() => {
    const video = videoRef.current;
    const canvas = masksCanvasRef.current;
    if (!canvas) return;

    if (!video || !videoSrc || !showMasks || frameRleMasks.length === 0) {
      if (lastMaskFrameIndexRef.current !== -1) {
        clearCanvas(canvas);
        lastMaskFrameIndexRef.current = -1;
      }
      return;
    }

    const idx = timeToFrameIndex(video.currentTime, fps, frameRleMasks.length);
    if (idx === lastMaskFrameIndexRef.current) return;
    lastMaskFrameIndexRef.current = idx;

    const entry = frameRleMasks[idx];
    if (!entry || entry.tags.length === 0) {
      clearCanvas(canvas);
      return;
    }

    renderSegmentationOverlay(canvas, entry.tags, dimensions.width || 1920, dimensions.height || 1080);
  }, [showMasks, frameRleMasks, fps, dimensions, videoSrc]);

  // Drives all three overlay renders and the current-time state on every
  // animation frame while video is loaded.  The loop is torn down and
  // restarted whenever the video source changes.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    let running = true;

    function tick() {
      if (!running) return;
      renderOverlay();
      renderMasksOverlay();
      renderLinesOverlayCallback();
      if (video) setCurrentTime(video.currentTime);
      animFrameRef.current = requestAnimationFrame(tick);
    }

    tick();
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [videoSrc, renderOverlay, renderMasksOverlay, renderLinesOverlayCallback]);

  // Toggles play/pause on the video element and mirrors the state into React.
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  }, []);

  // Global keyboard shortcut: Space or K toggles play/pause,
  // ignored when focus is inside an input or textarea.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " " || e.key === "k" || e.key === "K") {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [togglePlay]);

  /** Resets the playing state when the video reaches the end. */
  const handleVideoEnded = useCallback(() => setPlaying(false), []);

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-zinc-950">
      {/* Header bar */}
      {showToolbars && (
      <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 shrink-0">
          Video Player
        </span>

        <button
          onClick={loadFromPicker}
          disabled={loading}
          className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors whitespace-nowrap disabled:opacity-50"
        >
          Choose Folder…
        </button>

        {videoSrc && (
          <>
            <button
              onClick={() => setShowOverlay((v) => !v)}
              className={`rounded border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                showOverlay
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                  : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
              }`}
            >
              {showOverlay ? "Hide Boundary" : "Show Boundary"}
            </button>

            {showOverlay && (
              <>
                <button
                  onClick={() => setShowFullLabels((v) => !v)}
                  className={`rounded border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    showFullLabels
                      ? "border-amber-500 bg-amber-500/20 text-amber-300"
                      : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
                  }`}
                >
                  {showFullLabels ? "Short Labels" : "Full Labels"}
                </button>

                <button
                  onClick={() => setShowSafeZones((v) => !v)}
                  className={`rounded border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    showSafeZones
                      ? "border-green-500 bg-green-500/20 text-green-300"
                      : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
                  }`}
                >
                  {showSafeZones ? "Hide Safe Zones" : "Show Safe Zones"}
                </button>

              </>
            )}

            {frameRleMasks.length > 0 && (
              <button
                onClick={() => setShowMasks((v) => !v)}
                className={`rounded border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  showMasks
                    ? "border-violet-500 bg-violet-500/20 text-violet-300"
                    : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
                }`}
              >
                {showMasks ? "Hide Masks" : "Show Masks"}
              </button>
            )}

            {framePoints.some((f) => f.lines.length > 0) && (
              <button
                onClick={() => setShowLines((v) => !v)}
                className={`rounded border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  showLines
                    ? "border-orange-500 bg-orange-500/20 text-orange-300"
                    : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
                }`}
              >
                {showLines ? "Hide Lines" : "Show Lines"}
              </button>
            )}

            <div className="flex items-center gap-1 whitespace-nowrap">
              <label className="text-xs text-zinc-500">FPS</label>
              <input
                type="number"
                min={1}
                max={120}
                value={fps}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (v > 0 && v <= 120) setFps(v);
                }}
                className="w-14 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-300 text-center focus:border-zinc-500 focus:outline-none"
              />
            </div>

            <span className="text-xs text-zinc-500 whitespace-nowrap">
              {currentFrame}
            </span>
          </>
        )}
      </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mx-4 mt-2 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Body: sidebar + video */}
      <div className="flex flex-1 overflow-hidden">
        <SideBar
          isOpen
          zones={detectedZones.filter((z) => currentZoneNames.has(z.id))}
        />

        {/* Video + controls column */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Video area */}
          {videoSrc ? (
            <div className="relative flex-1 bg-black overflow-hidden">
              <div
                ref={containerRef}
                className="absolute inset-0"
                onMouseEnter={() => setIsMouseOverVideo(true)}
                onMouseLeave={() => setIsMouseOverVideo(false)}
              >
                {/* Toolbar toggle button */}
                <button
                  onClick={() => setShowToolbars((v) => !v)}
                  title={showToolbars ? "Hide toolbars" : "Show toolbars"}
                  className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded bg-black/50 text-zinc-400 hover:bg-black/70 hover:text-zinc-100 transition-colors"
                >
                  {showToolbars ? (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <rect x="3" y="4" width="18" height="3" rx="1" fill="currentColor" stroke="none" />
                      <rect x="3" y="17" width="18" height="3" rx="1" fill="currentColor" stroke="none" />
                      <line x1="7" y1="12" x2="17" y2="12" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <rect x="3" y="4" width="18" height="3" rx="1" fill="currentColor" stroke="none" opacity="0.4" />
                      <rect x="3" y="17" width="18" height="3" rx="1" fill="currentColor" stroke="none" opacity="0.4" />
                      <line x1="7" y1="12" x2="17" y2="12" strokeLinecap="round" />
                    </svg>
                  )}
                </button>
                <video
                  ref={videoRef}
                  src={videoSrc}
                  className="absolute inset-0 w-full h-full object-contain bg-black"
                  onLoadedMetadata={handleVideoLoaded}
                  onEnded={handleVideoEnded}
                  onPause={() => setPlaying(false)}
                  onPlay={() => setPlaying(true)}
                  controls={false}
                  playsInline
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none object-contain"
                  style={{ mixBlendMode: "normal" }}
                />
                <canvas
                  ref={masksCanvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none object-contain"
                  style={{ mixBlendMode: "normal" }}
                />
                <canvas
                  ref={linesCanvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none object-contain"
                  style={{ mixBlendMode: "normal" }}
                />

                {/* Play/Pause overlay button — only visible when mouse is over the video */}
                {isMouseOverVideo && (
                <button
                  onClick={togglePlay}
                  className="absolute inset-0 flex items-center justify-center bg-transparent group"
                >
                  <div
                    className={`flex h-16 w-16 items-center justify-center rounded-full bg-black/50 text-white transition-opacity ${
                      playing
                        ? "opacity-0 group-hover:opacity-70"
                        : "opacity-80 group-hover:opacity-100"
                    }`}
                  >
                    {playing ? (
                      <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="4" width="4" height="16" />
                        <rect x="14" y="4" width="4" height="16" />
                      </svg>
                    ) : (
                      <svg className="h-7 w-7 ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <polygon points="5,3 19,12 5,21" />
                      </svg>
                    )}
                  </div>
                </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center text-zinc-600">
                {loading ? (
                  <p className="text-sm">Loading…</p>
                ) : (
                  <>
                    <p className="text-lg mb-2">No video loaded</p>
                    <p className="text-sm">
                      Enter a directory path containing <code className="text-zinc-400">footage.mp4</code> and{" "}
                      <code className="text-zinc-400">points.json</code>, or use Choose Folder.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Playback controls bar */}
          {videoSrc && showToolbars && (
            <div className="flex items-center gap-3 border-t border-zinc-800 px-4 py-2">
              <button
                onClick={togglePlay}
                className={`rounded border-2 px-4 py-1.5 text-sm font-semibold transition-colors ${
                  playing
                    ? "border-amber-500 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                    : "border-zinc-600 text-zinc-300 hover:bg-zinc-700"
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
                  animManagerRef.current.reset();
                }}
                className="flex-1 h-1 accent-zinc-400"
              />

              <span className="text-xs text-zinc-500 tabular-nums whitespace-nowrap min-w-20 text-right">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/** Formats a duration in seconds as `m:ss`. Returns `"0:00"` for non-finite values. */
function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
