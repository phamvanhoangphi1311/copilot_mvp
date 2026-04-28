"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { renderBoundaryOverlay, renderLinesOverlay, BoundaryZone, BoundaryRecord, LineAnnotation } from "@/lib/boundaryOverlay";
import { renderSegmentationOverlay, SegmentationTag } from "@/lib/segmentationOverlay";

interface ImageEntry {
  name: string;
  src: string;
  isObjectUrl?: boolean;
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"]);

/**
 * Renders a canvas-based overlay for a selected image frame and caches the
 * result as a data-URL so the same frame is never decoded twice.
 */
function renderOverlayToUrl<T>(
  enabled: boolean,
  key: string | null,
  data: T | undefined,
  cache: Map<string, string>,
  setUrl: (url: string | null) => void,
  render: (canvas: HTMLCanvasElement, data: T) => void,
): void {
  if (!enabled || !key || data === undefined) {
    setUrl(null);
    return;
  }
  if (cache.has(key)) {
    setUrl(cache.get(key)!);
    return;
  }
  const canvas = document.createElement("canvas");
  render(canvas, data);
  const url = canvas.toDataURL();
  cache.set(key, url);
  setUrl(url);
}

interface ImageGalleryProps {
  initialMasks?: Array<{ image: string; tags: SegmentationTag[] }>;
  initialPoints?: BoundaryRecord[];
  initialDir?: string;
}

export default function ImageGalleryTab({
  initialMasks = [],
  initialPoints = [],
  initialDir = "",
}: ImageGalleryProps) {
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [folderName, setFolderName] = useState(initialDir);
  const objectUrlsRef = useRef<string[]>([]);

  // Segmentation overlay state
  const [masksMap, setMasksMap] = useState<Record<string, SegmentationTag[]>>({});
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const [overlayDecoding, setOverlayDecoding] = useState(false);
  const overlayCache = useRef<Map<string, string>>(new Map());

  // Boundary overlay state
  const [boundaryMap, setBoundaryMap] = useState<Record<string, BoundaryZone[]>>({});
  const [showBoundary, setShowBoundary] = useState(false);
  const [boundaryUrl, setBoundaryUrl] = useState<string | null>(null);
  const boundaryCache = useRef<Map<string, string>>(new Map());

  // Lines overlay state
  const [linesMap, setLinesMap] = useState<Record<string, LineAnnotation[]>>({});
  const [showLines, setShowLines] = useState(false);
  const [linesUrl, setLinesUrl] = useState<string | null>(null);
  const linesCache = useRef<Map<string, string>>(new Map());

  const selected = selectedIndex !== null ? images[selectedIndex] ?? null : null;

  /**
   * Advances to the next image in the gallery, wrapping around at the end.
   */
  const goNext = useCallback(() =>
    setSelectedIndex((i) => (i !== null ? (i + 1) % images.length : null)), [images.length]);
  /**
   * Steps back to the previous image in the gallery, wrapping at the start.
   */
  const goPrev = useCallback(() =>
    setSelectedIndex((i) => (i !== null ? (i - 1 + images.length) % images.length : null)), [images.length]);

  useEffect(() => {
    if (selectedIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "Escape") setSelectedIndex(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIndex, goNext, goPrev]);

  /**
   * Converts a flat `labels.json` record array into a per-filename map and
   * stores it in state.  Also resets the segmentation overlay so stale
   * renders from a previous dataset are not shown.
   */
  function loadMasksFromRecords(records: { image: string; tags: SegmentationTag[] }[]) {
    const map: Record<string, SegmentationTag[]> = {};
    for (const rec of records) map[rec.image] = rec.tags;
    setMasksMap(map);
    setShowOverlay(false);
    setOverlayUrl(null);
    overlayCache.current.clear();
  }

  /**
   * Converts a flat `labels_points.json` record array into two per-filename
   * maps (boundary zones and line annotations) and stores them in state.
   */
  function loadBoundaryFromRecords(records: BoundaryRecord[]) {
    const boundaryMapNew: Record<string, BoundaryZone[]> = {};
    const linesMapNew: Record<string, LineAnnotation[]> = {};
    for (const rec of records) {
      boundaryMapNew[rec.image] = rec.zones;
      if (rec.lines && rec.lines.length > 0) linesMapNew[rec.image] = rec.lines;
    }
    setBoundaryMap(boundaryMapNew);
    setShowBoundary(false);
    setBoundaryUrl(null);
    boundaryCache.current.clear();
    setLinesMap(linesMapNew);
    setShowLines(false);
    setLinesUrl(null);
    linesCache.current.clear();
  }

  useEffect(() => {
    const folder = folderName.trim();
    if (folder) {
      loadDefault();
    } else {
      // No default gallery dir — load server-provided records only and skip directory checks
      if (initialMasks.length > 0) loadMasksFromRecords(initialMasks);
      if (initialPoints.length > 0) loadBoundaryFromRecords(initialPoints);
      setLoading(false);
    }
    return () => revokeAll();
  }, []);

  // Decode overlay when image or toggle changes
  const selectedName = selected?.name ?? null;
  useEffect(() => {
    if (!showOverlay || !selectedName || !masksMap[selectedName] || !selected) {
      setOverlayUrl(null);
      return;
    }
    if (overlayCache.current.has(selectedName)) {
      setOverlayUrl(overlayCache.current.get(selectedName)!);
      return;
    }
    setOverlayDecoding(true);
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      renderSegmentationOverlay(canvas, masksMap[selectedName]!, img.naturalWidth, img.naturalHeight);
      const url = canvas.toDataURL();
      overlayCache.current.set(selectedName, url);
      setOverlayUrl(url);
      setOverlayDecoding(false);
    };
    img.onerror = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      renderSegmentationOverlay(canvas, masksMap[selectedName]!);
      const url = canvas.toDataURL();
      overlayCache.current.set(selectedName, url);
      setOverlayUrl(url);
      setOverlayDecoding(false);
    };
    img.src = selected.src;
    return () => { cancelled = true; };
  }, [showOverlay, selectedName, masksMap, selected]);

  // Render boundary overlay when image or toggle changes
  useEffect(() => {
    renderOverlayToUrl(
      showBoundary,
      selectedName,
      selectedName != null ? boundaryMap[selectedName] : undefined,
      boundaryCache.current,
      setBoundaryUrl,
      (canvas, zones) => renderBoundaryOverlay(canvas, zones),
    );
  }, [showBoundary, selectedName, boundaryMap]);

  // Render lines overlay when image or toggle changes
  useEffect(() => {
    renderOverlayToUrl(
      showLines,
      selectedName,
      selectedName != null ? linesMap[selectedName] : undefined,
      linesCache.current,
      setLinesUrl,
      (canvas, lines) => renderLinesOverlay(canvas, lines),
    );
  }, [showLines, selectedName, linesMap]);

  /** Revokes all object URLs created by the File System Access API picker to free memory. */
  function revokeAll() {
    objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    objectUrlsRef.current = [];
  }

  /**
   * Loads images and annotation data for the current `folderName`.
   */
  async function loadDefault() {
    setLoading(true);
    setSelectedIndex(null);
    const folder = folderName.trim().replace(/[/\\]+$/, "");
    try {
      const url = folder
        ? `/api/images?dir=${encodeURIComponent(folder)}`
        : "/api/images";
      const data = await fetch(url).then((r) => r.json());
      setImages(data.images ?? []);
    } catch {
      setImages([]);
    } finally {
      setLoading(false);
    }
    // Use server-pre-fetched labels when no custom folder is set; otherwise fetch from the folder.
    if (!folder && initialMasks.length > 0) {
      loadMasksFromRecords(initialMasks);
    } else {
      try {
        const url = folder
          ? `/api/masks?dir=${encodeURIComponent(folder)}`
          : "/api/masks";
        const records = await fetch(url).then((r) => r.json());
        if (Array.isArray(records)) loadMasksFromRecords(records);
      } catch {
        setMasksMap({});
      }
    }
    // Use server-pre-fetched mask-points when no custom folder is set; otherwise fetch from the folder.
    if (!folder && initialPoints.length > 0) {
      loadBoundaryFromRecords(initialPoints);
      } else {
      try {
        const url = folder
          ? `/api/points?dir=${encodeURIComponent(folder)}`
          : "/api/points";
        const records = await fetch(url).then((r) => r.json());
        if (Array.isArray(records)) loadBoundaryFromRecords(records);
      } catch {
        setBoundaryMap({});
      }
    }
  }

  /**
   * Opens a native directory picker (Chrome/Edge only via the File System
   * Access API) and loads images plus annotation files directly from the
   * chosen folder without routing through the Next.js server.
   */
  async function handleChooseFolder() {
    if (!("showDirectoryPicker" in window)) {
      alert("Folder picker is not supported in this browser. Please use Chrome or Edge.");
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dirHandle = await (window as any).showDirectoryPicker({ mode: "read" });
      setLoading(true);
      setSelectedIndex(null);
      revokeAll();

      const newImages: ImageEntry[] = [];
      let masksHandle: FileSystemFileHandle | null = null;
      let boundaryHandle: FileSystemFileHandle | null = null;
      let framesHandle: FileSystemDirectoryHandle | null = null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const [name, handle] of (dirHandle as any).entries()) {
        if (handle.kind === "directory" && name === "frames") {
          framesHandle = handle;
          continue;
        }
        if (handle.kind !== "file") continue;
        if (name === "masks.json") {
          masksHandle = handle;
          continue;
        }
        if (name === "points.json") {
          boundaryHandle = handle;
          continue;
        }
      }

      // Read images from the frames subfolder
      if (!framesHandle) {
        setImages([]);
        setLoading(false);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const [name, handle] of (framesHandle as any).entries()) {
        if (handle.kind !== "file") continue;
        const ext = name.split(".").pop()?.toLowerCase() ?? "";
        if (!IMAGE_EXTENSIONS.has(ext)) continue;
        const file = await handle.getFile();
        const url = URL.createObjectURL(file);
        objectUrlsRef.current.push(url);
        newImages.push({ name, src: url, isObjectUrl: true });
      }

      newImages.sort((a, b) => a.name.localeCompare(b.name));
      setImages(newImages);
      setFolderName(dirHandle.name + "/");

      // Load masks.json from the chosen folder
      if (masksHandle) {
        try {
          const masksFile = await masksHandle.getFile();
          const text = await masksFile.text();
          const records = JSON.parse(text);
          if (Array.isArray(records)) loadMasksFromRecords(records);
        } catch {
          setMasksMap({});
        }
      } else {
        setMasksMap({});
      }

      // Load labels_points.json from the chosen folder
      if (boundaryHandle) {
        try {
          const bFile = await boundaryHandle.getFile();
          const text = await bFile.text();
          const records = JSON.parse(text);
          if (Array.isArray(records)) loadBoundaryFromRecords(records);
        } catch {
          setBoundaryMap({});
        }
      } else {
        setBoundaryMap({});
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== "AbortError") console.error(err);
      // User cancelled — do nothing
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-[#05080c]">
      {/* Header bar */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] bg-[#07111a]/80 px-5 py-3 backdrop-blur-xl">
        <div className="shrink-0">
          <div className="hud-kicker">Frame review</div>
          <div className="text-sm font-semibold text-white">Image Gallery</div>
        </div>

        <button
          onClick={handleChooseFolder}
          disabled={loading}
          className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.08] transition-colors whitespace-nowrap disabled:opacity-50"
        >
          Choose Folder…
        </button>
        {selected && (
          <>
            {masksMap[selected.name] && (
              <button
                onClick={() => setShowOverlay((v) => !v)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  showOverlay
                    ? "border-blue-500 bg-blue-500/20 text-blue-300"
                    : "border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100"
                }`}
              >
                {showOverlay ? "Hide Masks" : "Show Masks"}
              </button>
            )}
            {boundaryMap[selected.name] && (
              <button
                onClick={() => setShowBoundary((v) => !v)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  showBoundary
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                    : "border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100"
                }`}
              >
                {showBoundary ? "Hide Boundary" : "Show Boundary"}
              </button>
            )}
            {linesMap[selected.name] && (
              <button
                onClick={() => setShowLines((v) => !v)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  showLines
                    ? "border-orange-500 bg-orange-500/20 text-orange-300"
                    : "border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100"
                }`}
              >
                {showLines ? "Hide Lines" : "Show Lines"}
              </button>
            )}
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs text-zinc-400">
              {selectedIndex !== null ? selectedIndex + 1 : ""} / {images.length}
            </span>
            <button
              onClick={() => setSelectedIndex(null)}
              className="text-xs text-zinc-500 hover:text-zinc-100 transition-colors"
            >
              ✕ Close preview
            </button>
          </>
        )}
      </div>

      {/* Full-screen preview */}
      {selected ? (
        <div className="relative flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_top,rgba(67,199,255,0.08),transparent_26%),#020304]">
          {/* Prev button */}
          <button
            onClick={goPrev}
            className="absolute left-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] bg-black/45 text-zinc-300 backdrop-blur-md hover:bg-black/70 hover:text-white transition-colors"
            aria-label="Previous image"
          >
            ‹
          </button>

          {/* Image — click background to close */}
          <div
            className="flex flex-1 h-full items-center justify-center cursor-zoom-out"
            onClick={() => setSelectedIndex(null)}
          >
            <div className="relative inline-flex items-center justify-center" style={{ maxHeight: "calc(100vh - 6rem)", maxWidth: "100%" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selected.src}
                alt={selected.name}
                className="max-h-full max-w-full object-contain"
                style={{ maxHeight: "calc(100vh - 6rem)" }}
                onClick={(e) => e.stopPropagation()}
              />
              {showOverlay && overlayUrl && (
                <img
                  src={overlayUrl}
                  alt=""
                  className="absolute inset-0 m-auto max-h-full max-w-full object-contain pointer-events-none"
                  style={{ maxHeight: "calc(100vh - 6rem)" }}
                />
              )}
              {showLines && linesUrl && (
                <img
                  src={linesUrl}
                  alt=""
                  className="absolute inset-0 m-auto max-h-full max-w-full object-contain pointer-events-none"
                  style={{ maxHeight: "calc(100vh - 6rem)" }}
                />
              )}
              {showBoundary && boundaryUrl && (
                <img
                  src={boundaryUrl}
                  alt=""
                  className="absolute inset-0 m-auto max-h-full max-w-full object-contain pointer-events-none"
                  style={{ maxHeight: "calc(100vh - 6rem)" }}
                />
              )}
              {overlayDecoding && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="rounded bg-black/70 px-3 py-1.5 text-xs text-zinc-300">Decoding segmentation…</span>
                </div>
              )}
            </div>
          </div>

          {/* Next button */}
          <button
            onClick={goNext}
            className="absolute right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] bg-black/45 text-zinc-300 backdrop-blur-md hover:bg-black/70 hover:text-white transition-colors"
            aria-label="Next image"
          >
            ›
          </button>

          <p className="absolute bottom-5 rounded-full border border-white/[0.08] bg-black/40 px-3 py-1.5 text-xs text-zinc-300 pointer-events-none backdrop-blur-md">{selected.name}</p>
        </div>
      ) : (
        /* Grid view */
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="text-sm text-zinc-500">Loading images…</p>
          ) : images.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No images found in {folderName}.{" "}
              <button onClick={handleChooseFolder} className="underline hover:text-zinc-300">
                Choose a folder
              </button>
            </p>
          ) : (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
            >
              {images.map((img, idx) => (
                <button
                  key={img.src}
                  onClick={() => setSelectedIndex(idx)}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] shadow-[0_16px_40px_rgba(0,0,0,0.22)] hover:border-cyan-300/30 hover:bg-white/[0.05] transition-all text-left"
                >
                  <div className="flex h-40 w-full items-center justify-center overflow-hidden bg-black/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.src}
                      alt={img.name}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02] group-hover:opacity-90"
                    />
                  </div>
                  <span className="truncate px-3 py-2 text-xs text-zinc-400 group-hover:text-zinc-100 transition-colors">
                    {img.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
