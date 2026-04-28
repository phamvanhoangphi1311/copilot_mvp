import { existsSync } from "fs";
import path from "path";

export type FeatureId = "feature_1" | "feature_2" | "feature_3";

export interface FeatureTabOverrides {
  video?: "default" | "feature2" | "feature3";
  gallery?: "default" | "feature2" | "feature3";
}

export interface FeatureConfig {
  id: FeatureId;
  label: string;
  dir: string;
  enabled: boolean;
  disabledReason?: string;
  summary?: string;
  componentOverrides?: FeatureTabOverrides;
}

function findProjectRoot(startDir: string): string {
  let currentDir = path.resolve(startDir);

  while (true) {
    const hasPackageJson = existsSync(path.join(currentDir, "package.json"));
    const hasAppPage = existsSync(path.join(currentDir, "app", "page.tsx"));
    if (hasPackageJson && hasAppPage) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return path.resolve(startDir);
    }
    currentDir = parentDir;
  }
}

const PROJECT_ROOT = findProjectRoot(process.cwd());
const DATA_ROOT = process.env.DATA_DIR?.trim()
  ? path.resolve(process.env.DATA_DIR)
  : PROJECT_ROOT;

export function getProjectRoot(): string {
  return PROJECT_ROOT;
}

export function getFeatureDirectory(featureId: FeatureId): string {
  switch (featureId) {
    case "feature_1": {
      const preferredDir = path.join(DATA_ROOT, "Feature_1");
      return existsSync(preferredDir)
        ? preferredDir
        : path.join(PROJECT_ROOT, "Feature_1");
    }
    case "feature_2": {
      const preferredDir = path.join(DATA_ROOT, "Feature_2");
      return existsSync(preferredDir)
        ? preferredDir
        : path.join(PROJECT_ROOT, "Feature_2");
    }
    case "feature_3": {
      const preferredDir = path.join(DATA_ROOT, "Feature_3");
      return existsSync(preferredDir)
        ? preferredDir
        : path.join(PROJECT_ROOT, "Feature_3");
    }
  }
}
