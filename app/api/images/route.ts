import { NextRequest, NextResponse } from "next/server";
import { readFile, readdir, stat } from "fs/promises";
import path from "path";
import { getProjectRoot } from "@/lib/features";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"]);

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

export async function GET(req: NextRequest) {
  const dirParam = req.nextUrl.searchParams.get("dir");
  const file = req.nextUrl.searchParams.get("file");

  // ── Single image: GET /api/images?dir=<path>&file=<name> ──────────────────
  if (file) {
    if (!dirParam) {
      return NextResponse.json({ error: "Missing dir param" }, { status: 400 });
    }

    // Only allow plain filenames — no subdirectory traversal
    if (file !== path.basename(file)) {
      return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
    }

    const ext = path.extname(file).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: "File type not allowed" }, { status: 403 });
    }

    const resolvedDir = path.resolve(dirParam);
    const framesDir = path.join(resolvedDir, "frames");
    const filePath = path.join(framesDir, file);

    if (!filePath.startsWith(framesDir + path.sep)) {
      return NextResponse.json({ error: "Path traversal detected" }, { status: 403 });
    }

    try {
      await stat(filePath);
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const data = await readFile(filePath);
    const mimeType = MIME_TYPES[ext] ?? "application/octet-stream";

    return new NextResponse(data, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // ── Image list: GET /api/images?dir=<path> ────────────────────────────────
  let framesDir: string;
  let buildSrc: (f: string) => string;

  if (dirParam) {
    const resolvedFeatureDir = path.resolve(dirParam);
    if (!path.isAbsolute(resolvedFeatureDir)) {
      return NextResponse.json({ error: "Invalid directory" }, { status: 400 });
    }
    framesDir = path.join(resolvedFeatureDir, "frames");
    buildSrc = (f: string) =>
      `/api/images?dir=${encodeURIComponent(resolvedFeatureDir)}&file=${encodeURIComponent(f)}`;
  } else {
    framesDir = path.join(getProjectRoot(), "public", "frames");
    buildSrc = (f: string) => `/frames/${f}`;
  }

  let files: string[];
  try {
    files = await readdir(framesDir);
  } catch {
    return NextResponse.json({ images: [] });
  }

  const images = files
    .filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .map((f) => ({ name: f, src: buildSrc(f) }));

  return NextResponse.json({ images }, {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
