"use client";

import { useCallback, useState } from "react";
import { useMemo } from "react";
import TaskBar, { AppTab } from "./TaskBar";
import SideBar from "./SideBar";
import VideoViewport from "./VideoViewport";
import ImageGallery from "./ImageGallery";
import VideoPlayerTab from "./VideoPlayerTab";
import { Zone, SafeMargin } from "./lib_2/types";

export default function EndoscopyLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<AppTab>("video");
  const [zones, setZones] = useState<Zone[]>([]);
  const [safeZones, setSafeZones] = useState<SafeMargin[]>([]);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  const animationState = useMemo(
    () => ({
      isAnimating: false,
      toggleAnimation: () => undefined,
      animGroupOpacity: 1,
      labelScale: 1,
      showDangerIcon: true,
      dangerBlinkOn: true,
    }),
    []
  );

  const handleUpdateZone = useCallback(
    (zoneId: string, updates: Partial<Zone>) => {
      setZones((prev) =>
        prev.map((z) => (z.id === zoneId ? { ...z, ...updates } : z))
      );
    },
    []
  );

  const handleUpdateSafeZone = useCallback(
    (zoneId: string, updates: Partial<SafeMargin>) => {
      setSafeZones((prev) =>
        prev.map((z) => (z.id === zoneId ? { ...z, ...updates } : z))
      );
    },
    []
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-black text-zinc-100">
      <TaskBar
        isAnimating={animationState.isAnimating}
        onToggleAnimation={animationState.toggleAnimation}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      <div className="flex flex-1 overflow-hidden">
        {activeTab === "endoscopy" ? (
          <>
            <SideBar
              isOpen={sidebarOpen}
              zones={zones}
              safeZones={safeZones}
              activeZoneId={activeZoneId}
              editMode={editMode}
              onSetZones={setZones}
              onSetSafeZones={setSafeZones}
              onSetActiveZoneId={setActiveZoneId}
              onSetEditMode={setEditMode}
            />
            <VideoViewport
              zones={zones}
              safeZones={safeZones}
              activeZoneId={activeZoneId}
              editMode={editMode}
              onUpdateZone={handleUpdateZone}
              onUpdateSafeZone={handleUpdateSafeZone}
              animGroupOpacity={animationState.animGroupOpacity}
              labelScale={animationState.labelScale}
              showDangerIcon={animationState.showDangerIcon}
              dangerBlinkOn={animationState.dangerBlinkOn}
            />
          </>
        ) : activeTab === "gallery" ? (
          <ImageGallery />
        ) : (
          <VideoPlayerTab />
        )}
      </div>
    </div>
  );
}
