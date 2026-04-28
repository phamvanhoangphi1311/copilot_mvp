import { access, readFile } from "fs/promises";
import path from "path";
import AICopilotLayout from "@/components/AICopilotLayout";
import type { BoundaryRecord } from "@/lib/boundaryOverlay";
import type { FeatureConfig } from "@/lib/features";
import type { SegmentationTag } from "@/lib/segmentationOverlay";
import { getFeatureDirectory, getProjectRoot } from "@/lib/features";

export const dynamic = "force-dynamic";

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string | null): Promise<T> {
  if (!filePath) {
    return [] as T;
  }

  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return [] as T;
  }
}

async function buildFeatureConfigs(): Promise<FeatureConfig[]> {
  const projectRoot = getProjectRoot();
  const feature1Dir = getFeatureDirectory("feature_1");
  const feature2Dir = getFeatureDirectory("feature_2");
  const feature3Dir = getFeatureDirectory("feature_3");
  const feature3ComponentPath = path.join(projectRoot, "components_3", "VideoPlayerTab.tsx");

  const [feature1Exists, feature2Exists, feature3Exists, feature3ComponentExists] =
    await Promise.all([
      pathExists(feature1Dir),
      pathExists(feature2Dir),
      pathExists(feature3Dir),
      pathExists(feature3ComponentPath),
    ]);

  return [
    {
      id: "feature_1",
      label: "Feature 1",
      dir: feature1Dir,
      enabled: feature1Exists,
      disabledReason: feature1Exists ? undefined : "Missing folder",
      summary: "Primary exposure and hazard awareness",
    },
    {
      id: "feature_2",
      label: "Feature 2",
      dir: feature2Dir,
      enabled: feature2Exists,
      disabledReason: feature2Exists ? undefined : "Coming soon",
      summary: "Reserved alternate workflow",
      componentOverrides: {
        video: "feature2",
        gallery: "feature2",
      },
    },
    {
      id: "feature_3",
      label: "Feature 3",
      dir: feature3Dir,
      enabled: feature3Exists && feature3ComponentExists,
      disabledReason: feature3Exists
        ? (feature3ComponentExists ? undefined : "Video component missing")
        : "Coming soon",
      summary: "Aortic root targeting and suturing assist",
      componentOverrides: {
        video: "feature3",
      },
    },
  ];
}

export default async function Home() {
  const features = await buildFeatureConfigs();

  const defaultFeature =
    features.find((feature) => feature.id === "feature_1" && feature.enabled) ??
    features.find((feature) => feature.enabled) ??
    features[0];

  const defaultGalleryDir = defaultFeature?.enabled ? defaultFeature.dir : "";

  const masksJsonPath = defaultGalleryDir
    ? path.join(defaultGalleryDir, "masks.json")
    : null;

  const pointsPath = defaultGalleryDir
    ? path.join(defaultGalleryDir, "points.json")
    : null;

  const [initialMasks, initialPoints] = await Promise.all([
    readJsonFile<Array<{ image: string; tags: SegmentationTag[] }>>(masksJsonPath),
    readJsonFile<BoundaryRecord[]>(pointsPath),
  ]);

  return (
    <AICopilotLayout
      features={features}
      initialMasks={initialMasks}
      initialPoints={initialPoints}
    />
  );
}
