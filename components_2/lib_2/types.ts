export interface Point {
  x: number; // 0–1 normalized
  y: number; // 0–1 normalized
}

export type ZoneFillStyle = "hatch" | "solid" | "outline" | "dashed";

export interface Zone {
  id: string;
  name: string;
  color: string;
  opacity: number;
  points: Point[];
  visible: boolean;
  fillStyle?: ZoneFillStyle;
  labelPos?: Point;
  accuracy?: number; // AI confidence percentage (0-100)
}

export type SafeZoneLineStyle = "solid" | "dashed";

/** Safety-margin corridor (open polyline + filled area). */
export interface SafeMargin {
  id: string;
  name: string;
  points: Point[]; // forms a polyline (open path, not closed)
  visible: boolean;
  lineColor: string;
  lineWidth: number;
  lineOpacity: number;
  lineStyle: SafeZoneLineStyle;
  areaColor: string;
  areaWidth: number; // thickness of the filled region around the line
  areaOpacity: number;
  labelPos?: Point;
  accuracy?: number;
}

// ── Zone subclasses ───────────────────────────────────────────────────────────

/** A polygon zone considered anatomically safe (defaults to green). */
export class SafeZone implements Zone {
  color = "#22c55e";
  opacity = 1;
  points: Point[] = [];
  visible = true;
  fillStyle: ZoneFillStyle = "dashed";
  labelPos?: Point;
  accuracy?: number;

  constructor(
    public id: string,
    public name: string,
  ) {}
}

/** A polygon zone considered anatomically dangerous (defaults to red). */
export class DangerZone implements Zone {
  color = "#ef4444";
  opacity = 1;
  points: Point[] = [];
  visible = true;
  fillStyle: ZoneFillStyle = "dashed";
  labelPos?: Point;
  accuracy?: number;

  constructor(
    public id: string,
    public name: string,
  ) {}
}

/** A polygon zone categorised as "other" (defaults to orange). */
export class OtherZone implements Zone {
  color = "#f97316";
  opacity = 1;
  points: Point[] = [];
  visible = true;
  fillStyle: ZoneFillStyle = "dashed";
  labelPos?: Point;
  accuracy?: number;

  constructor(
    public id: string,
    public name: string,
  ) {}
}

/** A polygon zone categorised as "tool" (defaults to blue). */
export class ToolZone implements Zone {
  color = "#3b82f6";
  opacity = 1;
  points: Point[] = [];
  visible = true;
  fillStyle: ZoneFillStyle = "solid";
  labelPos?: Point;
  accuracy?: number;

  constructor(
    public id: string,
    public name: string,
  ) {}
}
