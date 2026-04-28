"use client";

import { useMemo, useState } from "react";
import TaskBar, { AppTab } from "@/components/TaskBar";
import ImageGalleryTab from "@/components/ImageGalleryTab";
import Feature2Tab from "@/components/Feature2Tab";
import Feature3VideoTab from "@/components/Feature3VideoTab";
import VideoPlayerTab from "@/components/VideoPlayerTab";
import type { BoundaryRecord } from "@/lib/boundaryOverlay";
import type { FeatureConfig, FeatureId } from "@/lib/features";
import type { SegmentationTag } from "@/lib/segmentationOverlay";

interface AICopilotLayoutProps {
  features: FeatureConfig[];
  initialMasks: Array<{ image: string; tags: SegmentationTag[] }>;
  initialPoints: BoundaryRecord[];
}

export default function AICopilotLayout({
  features,
  initialMasks,
  initialPoints,
}: AICopilotLayoutProps) {
  const [activeTab, setActiveTab] = useState<AppTab>("video");
  const defaultFeature = useMemo(
    () => features.find((feature) => feature.enabled) ?? features[0],
    [features]
  );
  const [selectedFeature, setSelectedFeature] = useState<FeatureId>(
    defaultFeature?.id ?? "feature_1"
  );

  const activeFeature = useMemo(
    () => features.find((feature) => feature.id === selectedFeature) ?? defaultFeature,
    [defaultFeature, features, selectedFeature]
  );

  const activeComponent = activeFeature?.componentOverrides?.[activeTab] ?? "default";
  const prefetchedFeatureDir = defaultFeature?.dir ?? "";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-black text-zinc-100">
      <TaskBar
        activeTab={activeTab}
        features={features}
        selectedFeature={selectedFeature}
        onFeatureChange={setSelectedFeature}
        onTabChange={setActiveTab}
      />
      <div className="flex flex-1 overflow-hidden">
        {activeComponent === "feature2" ? (
          <Feature2Tab
            key={`${activeFeature?.id ?? "unknown"}-${activeTab}`}
            activeTab={activeTab}
            feature={activeFeature}
          />
        ) : activeComponent === "feature3" ? (
          <Feature3VideoTab
            key={`${activeFeature?.id ?? "unknown"}-${activeTab}`}
            initialDir={activeFeature?.dir ?? ""}
            initialMasks={initialMasks}
            initialPoints={initialPoints}
            prefetchedDir={prefetchedFeatureDir}
          />
        ) : activeTab === "gallery" ? (
          <ImageGalleryTab
            key={`${activeFeature?.id ?? "unknown"}-gallery`}
            initialMasks={initialMasks}
            initialPoints={initialPoints}
            initialDir={activeFeature?.dir ?? ""}
          />
        ) : (
          <VideoPlayerTab
            key={`${activeFeature?.id ?? "unknown"}-video`}
            initialDir={activeFeature?.dir ?? ""}
            initialMasks={initialMasks}
            initialPoints={initialPoints}
            prefetchedDir={prefetchedFeatureDir}
          />
        )}
      </div>
    </div>
  );
}
