import { SafeZone, DangerZone, OtherZone, ToolZone, Zone } from "./types";

// ── Zone classification ───────────────────────────────────────────────────────

const DANGER_LABELS = new Set(["Phrenic nerve"]);
const SAFE_LABELS = new Set(["Pericardium", "Aortic root", "Auricles"]);
const OTHER_LABELS = new Set(["Epicardial adipose tissue", "Epicardial fat on aortic"]);
const TOOL_LABELS = new Set(["Grasper", "Needle holder"]);

export type ZoneCategory = "danger" | "safe" | "other" | "tool" | "unknown";

export function classifyZone(label: string): ZoneCategory {
  if (DANGER_LABELS.has(label)) return "danger";
  if (SAFE_LABELS.has(label)) return "safe";
  if (OTHER_LABELS.has(label)) return "other";
  if (TOOL_LABELS.has(label)) return "tool";
  return "unknown";
}

export function createClassifiedZone(label: string): Zone {
  const category = classifyZone(label);
  switch (category) {
    case "danger":
      return new DangerZone(label, label);
    case "safe":
      return new SafeZone(label, label);
    case "other":
      return new OtherZone(label, label);
    case "tool":
      return new ToolZone(label, label);
    default:
      return new SafeZone(label, label);
  }
}

// ── Per-zone tracking state ───────────────────────────────────────────────────

interface TrackedZone {
  label: string;
  category: ZoneCategory;
  /** Video time (seconds) when the zone first appeared in the current continuous run. */
  appearedAtVideoTime: number;
  /** Whether the initial flash animation has completed. */
  flashDone: boolean;
  /** Smoothed label X position (canvas pixels). null = not yet initialized. */
  smoothX: number | null;
  /** Smoothed label Y position (canvas pixels). null = not yet initialized. */
  smoothY: number | null;
}

// ── Animation config ──────────────────────────────────────────────────────────

export const animationConfig = {
  /** Duration of the danger-zone flash animation in seconds (video time). */
  flashDurationSec: 3,
  /** Number of full on/off blink cycles during the flash. */
  flashCycles: 6,
  /** Peak label scale during the zoom-in animation (1 = normal). */
  labelZoomPeakScale: 1.8,
  /** Label offset-Y during zoom peak (px, negative = upward). */
  labelZoomOffsetY: -10,
  /** Boundary opacity after the flash animation completes (0–1). */
  steadyOpacity: 1,
  /** Smoothing factor for label position (0–1). Lower = smoother/slower. */
  labelSmoothingFactor: 0.01,
};

// ── Per-zone render hints produced each frame ─────────────────────────────────

export interface ZoneRenderHint {
  label: string;
  category: ZoneCategory;
  /** Stroke / fill opacity multiplier (0–1). 0 = hidden, 1 = fully visible. */
  opacity: number;
  /** Label opacity multiplier (0–1), independent of the boundary flash. */
  labelOpacity: number;
  /** Label scale multiplier (1 = normal size). */
  labelScale: number;
  /** Label X offset in canvas pixels (0 = default centroid position). */
  labelOffsetX: number;
  /** Label Y offset in canvas pixels (0 = default centroid position). */
  labelOffsetY: number;
  /** Whether the zone is currently in its flash animation. */
  flashing: boolean;
  /** How long (seconds, video time) the zone has been continuously on screen. */
  onScreenSec: number;
}

// ── Manager class ─────────────────────────────────────────────────────────────

export class BoundaryAnimationManager {
  private tracked = new Map<string, TrackedZone>();
  private _hints = new Map<string, ZoneRenderHint>();
  /** Last video time passed to update(). Used to detect paused/ended state. */
  private lastVideoTime = -1;
  /** Whether the video time is advancing (i.e. not paused/ended). */
  private playing = false;

  /**
   * Call once per animation frame with the set of zone labels currently visible.
   * @param visibleLabels  Set of zone labels present in the current frame.
   * @param videoTime      Current video playback time in seconds.
   * Returns a render hint per visible zone.
   */
  update(visibleLabels: Set<string>, videoTime: number): ZoneRenderHint[] {
    // Detect whether video is advancing
    this.playing = videoTime !== this.lastVideoTime;
    this.lastVideoTime = videoTime;

    // Remove zones that are no longer on screen
    for (const label of this.tracked.keys()) {
      if (!visibleLabels.has(label)) {
        this.tracked.delete(label);
      }
    }

    // Add newly appeared zones
    for (const label of visibleLabels) {
      if (!this.tracked.has(label)) {
        this.tracked.set(label, {
          label,
          category: classifyZone(label),
          appearedAtVideoTime: videoTime,
          flashDone: false,
          smoothX: null,
          smoothY: null,
        });
      }
    }

    // Build render hints
    const hints: ZoneRenderHint[] = [];
    this._hints.clear();
    for (const [, tz] of this.tracked) {
      const onScreenSec = videoTime - tz.appearedAtVideoTime;
      let opacity = 1;
      let labelScale = 1;
      let labelOpacity = 1;
      let labelOffsetX = 0;
      let labelOffsetY = 0;
      let flashing = false;

      // Danger zones flash when they first appear
      if (tz.category === "danger" && !tz.flashDone) {
        if (onScreenSec < animationConfig.flashDurationSec) {
          flashing = true;
          const progress = onScreenSec / animationConfig.flashDurationSec;

          // Sinusoidal blink: cycles full on/off oscillations within the duration
          const wave = Math.sin(progress * animationConfig.flashCycles * 2 * Math.PI);          // Map sin [-1,1] → opacity [0.15, 1] so the zone never fully disappears
          opacity = 0 + 1 * ((wave + 1) / 2);

          // Label zoom: hold at peak scale for the full flash duration
          labelScale = animationConfig.labelZoomPeakScale;
          labelOffsetY = animationConfig.labelZoomOffsetY;
        } else {
          tz.flashDone = true;
          opacity = animationConfig.steadyOpacity;
        }
      }

      if (tz.category === "danger" && tz.flashDone) {
        opacity = animationConfig.steadyOpacity;
      }

      const hint: ZoneRenderHint = {
        label: tz.label,
        category: tz.category,
        opacity,
        labelOpacity,
        labelScale,
        labelOffsetX,
        labelOffsetY,
        flashing,
        onScreenSec,
      };
      hints.push(hint);
      this._hints.set(tz.label, hint);
    }

    return hints;
  }

  /**
   * Smooth the label position for a zone. Call from the renderer with the
   * raw centroid each frame; returns the smoothed position.
   */
  smoothCentroid(label: string, rawX: number, rawY: number): { x: number; y: number } {
    const tz = this.tracked.get(label);
    if (!tz) return { x: rawX, y: rawY };

    if (tz.smoothX === null || tz.smoothY === null) {
      // First frame — snap directly to the raw position
      tz.smoothX = rawX;
      tz.smoothY = rawY;
    } else if (this.playing) {
      // Only update the smoothed position while the video is advancing
      const f = animationConfig.labelSmoothingFactor;
      tz.smoothX += (rawX - tz.smoothX) * f;
      tz.smoothY += (rawY - tz.smoothY) * f;
    }

    return { x: tz.smoothX, y: tz.smoothY };
  }

  /** Retrieve the render hint for a specific label (after update()). */
  getHint(label: string): ZoneRenderHint | undefined {
    // Hints are built fresh each update(); store them for lookup
    return this._hints.get(label);
  }

  /** Reset all tracking state (e.g. on video seek). */
  reset(): void {
    this.tracked.clear();
    this._hints.clear();
    this.lastVideoTime = -1;
    this.playing = false;
  }
}
