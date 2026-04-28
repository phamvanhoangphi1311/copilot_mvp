"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import SegmentationOverlay from "./SegmentationOverlay";
import { Zone, SafeMargin } from "./lib_2/types";

interface VideoViewportProps {
  zones: Zone[];
  safeZones: SafeMargin[];
  activeZoneId: string | null;
  editMode: boolean;
  onUpdateZone: (zoneId: string, updates: Partial<Zone>) => void;
  onUpdateSafeZone: (zoneId: string, updates: Partial<SafeMargin>) => void;
  animGroupOpacity?: number;
  labelScale: number;
  showDangerIcon: boolean;
  dangerBlinkOn: boolean;
}

export default function VideoViewport({
  zones,
  safeZones,
  activeZoneId,
  editMode,
  onUpdateZone,
  onUpdateSafeZone,
  animGroupOpacity,
  labelScale,
  showDangerIcon,
  dangerBlinkOn,
}: VideoViewportProps) {
  const mainRef = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width: pw, height: ph } = entry.contentRect;
      if (pw / ph > 16 / 9) {
        setSize({ w: Math.round(ph * (16 / 9)), h: Math.round(ph) });
      } else {
        setSize({ w: Math.round(pw), h: Math.round(pw * (9 / 16)) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <main ref={mainRef} className="flex flex-1 items-center justify-center overflow-hidden bg-black">
      <div className="relative" style={{ width: size.w, height: size.h }}>
      <Image
        src="/mitral_frame_1_modified.png"
        alt="Endoscopy video feed"
        fill
        priority
      />
      <SegmentationOverlay
        zones={zones}
        safeZones={safeZones}
        activeZoneId={activeZoneId}
        editMode={editMode}
        onUpdateZone={onUpdateZone}
        onUpdateSafeZone={onUpdateSafeZone}
        animGroupOpacity={animGroupOpacity}
        labelScale={labelScale}
        showDangerIcon={showDangerIcon}
        dangerBlinkOn={dangerBlinkOn}
      />
      </div>
    </main>
  );
}
