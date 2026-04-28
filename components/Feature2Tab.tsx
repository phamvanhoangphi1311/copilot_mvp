"use client";

import type { AppTab } from "@/components/TaskBar";
import type { FeatureConfig } from "@/lib/features";
import Feature2Gallery from "@/components_2/ImageGallery";
import Feature2VideoPlayer from "@/components_2/VideoPlayerTab";

interface Feature2TabProps {
  activeTab: AppTab;
  feature?: FeatureConfig;
}

export default function Feature2Tab({ activeTab, feature }: Feature2TabProps) {
  const initialDir = feature?.dir ?? "";

  if (activeTab === "gallery") {
    return <Feature2Gallery initialDir={initialDir} />;
  }

  return <Feature2VideoPlayer initialDir={initialDir} />;
}
