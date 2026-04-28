import { Zone, SafeMargin, SafeZoneLineStyle, ZoneFillStyle } from "./types";
import { safeZoneLine, safeZoneArea } from "./zoneStyles";

const VALID_FILL_STYLES: ZoneFillStyle[] = ["hatch", "solid", "outline", "dashed"];

/**
 * Text format:
 *   ZONE:<id>:<name>:<color>:<opacity>:<fillStyle>:[<labelX>,<labelY>]
 *   x,y
 *   x,y
 *   ...
 *   (blank line or next ZONE header)
 */
export function serializeZones(zones: Zone[]): string {
  return zones
    .map((zone) => {
      let header = `ZONE:${zone.id}:${zone.name}:${zone.color}:${zone.opacity}:${zone.fillStyle ?? "hatch"}`;
      if (zone.labelPos) {
        header += `:[${zone.labelPos.x.toFixed(6)},${zone.labelPos.y.toFixed(6)}]`;
      }
      const points = zone.points
        .map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`)
        .join("\n");
      return points ? `${header}\n${points}` : header;
    })
    .join("\n\n");
}

export function deserializeZones(text: string): Zone[] {
  const zones: Zone[] = [];
  const lines = text.trim().split("\n");
  let currentZone: Zone | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("SAFEZONE:")) {
      // Not a danger zone — save current and stop accumulating
      if (currentZone) zones.push(currentZone);
      currentZone = null;
      continue;
    }

    if (trimmed.startsWith("ZONE:")) {
      if (currentZone) zones.push(currentZone);
      
      const headerStr = trimmed.substring(5);
      const lpMatch = headerStr.match(/(:\[([\d.-]+),([\d.-]+)\])$/);
      let partsStr = headerStr;
      let labelPos;
      if (lpMatch) {
        partsStr = headerStr.slice(0, -lpMatch[1].length);
        labelPos = { x: parseFloat(lpMatch[2]), y: parseFloat(lpMatch[3]) };
      }
      
      const parts = partsStr.split(":");
      const parsedStyle = parts[4] as ZoneFillStyle | undefined;
      currentZone = {
        id: parts[0] || crypto.randomUUID(),
        name: parts[1] || "Unnamed",
        color: parts[2] || "#ef4444",
        opacity: parseFloat(parts[3]) || 0.3,
        points: [],
        visible: true,
        fillStyle: parsedStyle && VALID_FILL_STYLES.includes(parsedStyle) ? parsedStyle : "hatch",
        labelPos,
      };
    } else if (currentZone) {
      const [xStr, yStr] = trimmed.split(",");
      const x = parseFloat(xStr);
      const y = parseFloat(yStr);
      if (!isNaN(x) && !isNaN(y)) {
        currentZone.points.push({
          x: Math.max(0, Math.min(1, x)),
          y: Math.max(0, Math.min(1, y)),
        });
      }
    }
  }

  if (currentZone) zones.push(currentZone);
  return zones;
}

/**
 * Text format for safe zones:
 *   SAFEZONE:<id>:<name>:<lineColor>:<lineWidth>:<lineOpacity>:<lineStyle>:<areaColor>:<areaWidth>:<areaOpacity>:[<labelX>,<labelY>]
 *   x,y
 *   x,y
 *   ...
 */
export function serializeSafeZones(safeZones: SafeMargin[]): string {
  return safeZones
    .map((sz) => {
      let header = `SAFEZONE:${sz.id}:${sz.name}:${sz.lineColor}:${sz.lineWidth}:${sz.lineOpacity}:${sz.lineStyle}:${sz.areaColor}:${sz.areaWidth}:${sz.areaOpacity}`;
      if (sz.labelPos) {
        header += `:[${sz.labelPos.x.toFixed(6)},${sz.labelPos.y.toFixed(6)}]`;
      }
      const points = sz.points
        .map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`)
        .join("\n");
      return points ? `${header}\n${points}` : header;
    })
    .join("\n\n");
}

export function deserializeSafeZones(text: string): SafeMargin[] {
  const safeZones: SafeMargin[] = [];
  const lines = text.trim().split("\n");
  let current: SafeMargin | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("ZONE:")) {
      // Not a safe zone — save current and stop accumulating
      if (current) safeZones.push(current);
      current = null;
      continue;
    }

    if (trimmed.startsWith("SAFEZONE:")) {
      if (current) safeZones.push(current);

      const headerStr = trimmed.substring(9);
      const lpMatch = headerStr.match(/(:\[([\d.-]+),([\d.-]+)\])$/);
      let partsStr = headerStr;
      let labelPos;
      if (lpMatch) {
        partsStr = headerStr.slice(0, -lpMatch[1].length);
        labelPos = { x: parseFloat(lpMatch[2]), y: parseFloat(lpMatch[3]) };
      }

      const parts = partsStr.split(":");
      current = {
        id: parts[0] || crypto.randomUUID(),
        name: parts[1] || "Unnamed",
        lineColor: parts[2] || safeZoneLine.color,
        lineWidth: parseFloat(parts[3]) || safeZoneLine.width,
        lineOpacity: parseFloat(parts[4]) || safeZoneLine.opacity,
        lineStyle: (parts[5] === "solid" || parts[5] === "dashed" ? parts[5] : safeZoneLine.style) as SafeZoneLineStyle,
        areaColor: parts[6] || safeZoneArea.color,
        areaWidth: parseFloat(parts[7]) || safeZoneArea.width,
        areaOpacity: parseFloat(parts[8]) || safeZoneArea.opacity,
        points: [],
        visible: true,
        labelPos,
      };
    } else if (current) {
      const [xStr, yStr] = trimmed.split(",");
      const x = parseFloat(xStr);
      const y = parseFloat(yStr);
      if (!isNaN(x) && !isNaN(y)) {
        current.points.push({
          x: Math.max(0, Math.min(1, x)),
          y: Math.max(0, Math.min(1, y)),
        });
      }
    }
  }

  if (current) safeZones.push(current);
  return safeZones;
}
