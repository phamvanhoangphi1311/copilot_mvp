"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  renderBoundaryOverlay,
  renderSegmentationOverlay,
  renderLinesOverlay,
  renderSutureHints,
  extractSutureAnchorsFromFrame,
  getLabelColor,
  BoundaryZone,
  BoundaryRecord,
  LineAnnotation,
  LabelColor,
  SegmentationTag,
  SutureAnchor,
} from "./lib_2/rleDecoder";
import SideBar from "./SideBar";
import { Zone, SafeMargin } from "./lib_2/types";
import { BoundaryAnimationManager, createClassifiedZone } from "./lib_2/BoundaryAnimationManager";

interface FrameLabels {
  /** frame number extracted from image name */
  frameNum: number;
  zones: BoundaryZone[];
  lines: LineAnnotation[];
}

interface FrameRleLabels {
  frameNum: number;
  tags: SegmentationTag[];
}

interface VideoPlayerTabProps {
  initialDir?: string;
}

export default function VideoPlayerTab({ initialDir = "" }: VideoPlayerTabProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  const [dirPath, setDirPath] = useState(initialDir);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [frameLabels, setFrameLabels] = useState<FrameLabels[]>([]);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showSafeZones, setShowSafeZones] = useState(true);
  const [fps, setFps] = useState(18);
  const [currentFrame, setCurrentFrame] = useState<string>("");
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [useFsApi, setUseFsApi] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentZoneNames, setCurrentZoneNames] = useState<Set<string>>(new Set());
  const objectUrlRef = useRef<string | null>(null);
  const labelsCanvasRef = useRef<HTMLCanvasElement>(null);
  const linesCanvasRef = useRef<HTMLCanvasElement>(null);
  const sutureCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastLabelFrameIndexRef = useRef<number>(-1);
  const lastLinesFrameIndexRef = useRef<number>(-1);
  const animManagerRef = useRef(new BoundaryAnimationManager());
  const linesAnimManagerRef = useRef(new BoundaryAnimationManager());

  const [showLabels, setShowLabels] = useState(false);
  const [showSutureHints] = useState(true);
  const lastSutureFrameIndexRef = useRef<number>(-1);
  const [showLines, setShowLines] = useState(true);
  const [showToolbars, setShowToolbars] = useState(true);
  const [isMouseOverVideo, setIsMouseOverVideo] = useState(false);
  const [frameRleLabels, setFrameRleLabels] = useState<FrameRleLabels[]>([]);

  // Derive Zone[] from all frame labels for SideBar
  const detectedZones = useMemo((): Zone[] => {
    if (frameLabels.length === 0) return [];
    const countMap = new Map<string, number>();
    for (const frame of frameLabels) {
      for (const zone of frame.zones) {
        countMap.set(zone.label, (countMap.get(zone.label) ?? 0) + 1);
      }
    }
    const total = frameLabels.length;
    const entries = Array.from(countMap.entries()).map(([label, count]) => {
      const zone = createClassifiedZone(label);
      zone.accuracy = Math.round((count / total) * 100);
      return zone;
    });
    entries.sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0));
    return entries;
  }, [frameLabels]);

  // Parse labels_points.json into frame labels
  const parseLabels = useCallback((records: BoundaryRecord[]) => {
    const parsed: FrameLabels[] = records.map((rec) => {
      const match = rec.image.match(/(\d+)/);
      const frameNum = match ? parseInt(match[1], 10) : 0;
      return { frameNum, zones: rec.zones, lines: rec.lines ?? [] };
    });
    parsed.sort((a, b) => a.frameNum - b.frameNum);
    return parsed;
  }, []);

  // Parse labels.json (RLE) into per-frame label data
  const parseRleLabels = useCallback(
    (records: Array<{ image: string; tags: SegmentationTag[] }>) => {
      const parsed: FrameRleLabels[] = records.map((rec) => {
        const match = rec.image.match(/(\d+)/);
        const frameNum = match ? parseInt(match[1], 10) : 0;
        return { frameNum, tags: rec.tags };
      });
      parsed.sort((a, b) => a.frameNum - b.frameNum);
      return parsed;
    },
    []
  );

  // Load from server API (local directory path)
  const loadFromServer = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPlaying(false);
    revokeObjectUrl();

    try {
      // Check directory
      const check = await fetch("/api/local-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dir: dirPath }),
      });
      const info = await check.json();

      if (!check.ok) throw new Error(info.error || "Cannot access directory");
      if (!info.hasVideo) throw new Error("No video file found in directory (supported: footage.mp4, footage_ft2.mp4, video.mp4)");
      if (!info.hasLabels) throw new Error("labels_points.json not found in directory");

      // Resolve actual video filename found in directory
      const videoFile = info.videoFile ?? "footage.mp4";

      // Load labels
      const labelsRes = await fetch(
        `/api/local-files?dir=${encodeURIComponent(dirPath)}&file=labels_points.json`
      );
      const labelsData = await labelsRes.json();
      if (Array.isArray(labelsData)) {
        setFrameLabels(parseLabels(labelsData));
      }

      // Load RLE masks (optional — no error if missing)
      const rleFile = info.files?.includes("masks.json")
        ? "masks.json"
        : info.files?.includes("labels.json")
          ? "labels.json"
          : null;

      if (rleFile) {
        try {
          const rleRes = await fetch(
            `/api/local-files?dir=${encodeURIComponent(dirPath)}&file=${encodeURIComponent(rleFile)}`
          );
          if (rleRes.ok) {
            const rleData = await rleRes.json();
            setFrameRleLabels(Array.isArray(rleData) ? parseRleLabels(rleData) : []);
          } else {
            setFrameRleLabels([]);
          }
        } catch {
          setFrameRleLabels([]);
        }
      } else {
        setFrameRleLabels([]);
      }

      // Set video source (streamed from API)
      setVideoSrc(
        `/api/local-files?dir=${encodeURIComponent(dirPath)}&file=${encodeURIComponent(videoFile)}`
      );
      setUseFsApi(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setVideoSrc(null);
      setFrameLabels([]);
      setFrameRleLabels([]);
    } finally {
      setLoading(false);
    }
  }, [dirPath, parseLabels, parseRleLabels]);

  // Load via File System Access API (browser picker)
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
      let labelsHandle: FileSystemFileHandle | null = null;
      let rleLabelsHandle: FileSystemFileHandle | null = null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const [name, handle] of (dirHandle as any).entries()) {
        if (handle.kind !== "file") continue;
        if (!videoHandle && /^footage(?:\.ft2)?\.mp4$/i.test(name)) videoHandle = handle;
        if (name === "labels_points.json") labelsHandle = handle;
        if (name === "masks.json" || name === "labels.json") rleLabelsHandle = handle;
      }

      if (!videoHandle) throw new Error("No supported video found (footage.mp4, footage_ft2.mp4, video.mp4)");
      if (!labelsHandle) throw new Error("labels_points.json not found in directory");

      // Load labels
      const labelsFile = await labelsHandle.getFile();
      const text = await labelsFile.text();
      const records = JSON.parse(text);
      if (Array.isArray(records)) {
        setFrameLabels(parseLabels(records));
      }

      // Load video
      const videoFile = await videoHandle.getFile();
      const url = URL.createObjectURL(videoFile);
      objectUrlRef.current = url;
      setVideoSrc(url);
      setDirPath(dirHandle.name);
      setUseFsApi(true);

      // Load RLE labels (optional)
      if (rleLabelsHandle) {
        try {
          const rleFile = await rleLabelsHandle.getFile();
          const rleText = await rleFile.text();
          const rleRecords = JSON.parse(rleText);
          setFrameRleLabels(Array.isArray(rleRecords) ? parseRleLabels(rleRecords) : []);
        } catch {
          setFrameRleLabels([]);
        }
      } else {
        setFrameRleLabels([]);
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Failed to load");
        setFrameRleLabels([]);
      }
    } finally {
      setLoading(false);
    }
  }, [parseLabels, parseRleLabels]);

  function revokeObjectUrl() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }

  useEffect(() => () => revokeObjectUrl(), []);

  // Auto-load from the default directory on mount
  useEffect(() => {
    loadFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVideoLoaded = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    setDimensions({
      width: video.videoWidth,
      height: video.videoHeight,
    });
    setDuration(video.duration);
  }, []);

  // Find the label entry for a given video time
  const getZonesForTime = useCallback(
    (time: number): BoundaryZone[] | null => {
      if (frameLabels.length === 0) return null;

      const frameIndex = Math.round(time * fps);
      const idx = Math.min(frameIndex, frameLabels.length - 1);
      if (idx < 0) return null;

      return frameLabels[idx]?.zones ?? null;
    },
    [frameLabels, fps]
  );

  // Render overlay on canvas matching current video time
  const renderOverlay = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Always update frame counter and zone names regardless of overlay visibility
    const frameIndex = Math.round(video.currentTime * fps);
    const entry = frameLabels[Math.min(frameIndex, frameLabels.length - 1)];
    if (entry) {
      setCurrentFrame(`Frame ${entry.frameNum} (${frameIndex + 1}/${frameLabels.length})`);
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

    renderBoundaryOverlay(canvas, zones, dimensions.width || 1920, dimensions.height || 1080, animManagerRef.current, showSafeZones);
  }, [showOverlay, getZonesForTime, dimensions, fps, frameLabels, showSafeZones]);

  // Render line annotations overlay
  const renderLinesOverlayCallback = useCallback(() => {
    const video = videoRef.current;
    const canvas = linesCanvasRef.current;
    if (!canvas) return;

    if (!video || !videoSrc || !showLines || frameLabels.length === 0) {
      if (lastLinesFrameIndexRef.current !== -1) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        lastLinesFrameIndexRef.current = -1;
      }
      return;
    }

    const frameIndex = Math.round(video.currentTime * fps);
    const idx = Math.min(Math.max(frameIndex, 0), frameLabels.length - 1);
    if (idx === lastLinesFrameIndexRef.current) return;
    lastLinesFrameIndexRef.current = idx;

    const entry = frameLabels[idx];
    if (!entry || entry.lines.length === 0) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
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
      linesAnimManagerRef.current
    );
  }, [showLines, frameLabels, fps, dimensions, videoSrc]);

  // Render RLE segmentation labels on the labels canvas
  const renderLabelsOverlay = useCallback(() => {
    const video = videoRef.current;
    const canvas = labelsCanvasRef.current;
    if (!canvas) return;

    if (!video || !videoSrc || !showLabels || frameRleLabels.length === 0) {
      if (lastLabelFrameIndexRef.current !== -1) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        lastLabelFrameIndexRef.current = -1;
      }
      return;
    }

    const frameIndex = Math.round(video.currentTime * fps);
    const idx = Math.min(Math.max(frameIndex, 0), frameRleLabels.length - 1);
    if (idx === lastLabelFrameIndexRef.current) return;
    lastLabelFrameIndexRef.current = idx;

    const entry = frameRleLabels[idx];
    if (!entry || entry.tags.length === 0) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    renderSegmentationOverlay(
      canvas,
      entry.tags,
      dimensions.width || 1920,
      dimensions.height || 1080
    );
  }, [showLabels, frameRleLabels, fps, dimensions, videoSrc]);

  // Render suture hint overlay on the suture canvas
  const renderSutureOverlay = useCallback(() => {
    const canvas = sutureCanvasRef.current;
    if (!canvas) return;

    if (!showSutureHints || frameLabels.length === 0) {
      if (lastSutureFrameIndexRef.current !== -1) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        lastSutureFrameIndexRef.current = -1;
      }
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const frameIndex = Math.round(video.currentTime * fps);
    const idx = Math.min(Math.max(frameIndex, 0), frameLabels.length - 1);
    if (idx === lastSutureFrameIndexRef.current) return;
    lastSutureFrameIndexRef.current = idx;

    const entry = frameLabels[idx];
    const boundaryZone = entry?.zones.find(
      (z) => z.label === "Pericardium boundary"
    );
    if (!boundaryZone) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    // Normalize points to flat array
    const raw = boundaryZone.points;
    let flatPoints: { x: number; y: number }[] = [];
    if (raw.length > 0 && "x" in raw[0]) {
      flatPoints = raw as { x: number; y: number }[];
    } else {
      const polys = raw as { x: number; y: number }[][];
      flatPoints = polys[0] ?? [];
    }

    const anchors = extractSutureAnchorsFromFrame(flatPoints);

    renderSutureHints(
      canvas,
      anchors,
      dimensions.width || 1920,
      dimensions.height || 1080,
      video.currentTime
    );
  }, [showSutureHints, frameLabels, fps, dimensions]);

  // Animation loop for overlay
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    let running = true;

    function tick() {
      if (!running) return;
      renderOverlay();
      renderLabelsOverlay();
      renderLinesOverlayCallback();
      renderSutureOverlay();
      if (video) setCurrentTime(video.currentTime);
      animFrameRef.current = requestAnimationFrame(tick);
    }

    tick();
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [videoSrc, renderOverlay, renderLabelsOverlay, renderLinesOverlayCallback, renderSutureOverlay]);

  // Play / Pause
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

  // Keyboard shortcut: Space or K toggles play/pause
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

  const handleVideoEnded = useCallback(() => setPlaying(false), []);

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-zinc-950">
      {/* Header bar */}
      {showToolbars && (
      <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 shrink-0">
          Video Player
        </span>

        {!useFsApi && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <input
              type="text"
              value={dirPath}
              onChange={(e) => setDirPath(e.target.value)}
              placeholder="Directory path (e.g. D:\Projects\Dataset_new)"
              className="flex-1 min-w-0 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
            />
            <button
              onClick={loadFromServer}
              disabled={loading || !dirPath.trim()}
              className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {loading ? "Loading…" : "Load"}
            </button>
          </div>
        )}

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
            )}

                {frameRleLabels.length > 0 && (
                  <button
                    onClick={() => setShowLabels((v) => !v)}
                    className={`rounded border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                      showLabels
                        ? "border-violet-500 bg-violet-500/20 text-violet-300"
                        : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
                    }`}
                  >
                    {showLabels ? "Hide Labels" : "Show Labels"}
                  </button>
                )}

                {frameLabels.some((f) => f.lines.length > 0) && (
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
          safeZones={[] as SafeMargin[]}
          activeZoneId={null}
          editMode={false}
          onSetZones={() => {}}
          onSetSafeZones={() => {}}
          onSetActiveZoneId={() => {}}
          onSetEditMode={() => {}}
          showDevTool={false}
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
                  ref={labelsCanvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none object-contain"
                  style={{ mixBlendMode: "normal" }}
                />
                <canvas
                  ref={linesCanvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none object-contain"
                  style={{ mixBlendMode: "normal" }}
                />
                <canvas
                  ref={sutureCanvasRef}
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
                      <code className="text-zinc-400">labels_points.json</code>, or use Choose Folder.
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

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
