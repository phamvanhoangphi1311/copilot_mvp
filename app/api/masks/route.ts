import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { getProjectRoot } from "@/lib/features";

function isValidDirectory(dir: string): boolean {
  const normalized = path.resolve(dir);
  return normalized === dir || normalized === dir.replace(/[\/\\]+$/, "");
}

/** GET /api/masks?dir=<absolute-path> — serve masks.json from dir, or public/ if omitted. */
export async function GET(req: NextRequest) {
  const dir = req.nextUrl.searchParams.get("dir");

  let filePath: string;
  if (dir) {
    if (!isValidDirectory(dir)) {
      return NextResponse.json({ error: "Invalid directory" }, { status: 400 });
    }
    filePath = path.join(path.resolve(dir), "masks.json");
    if (!filePath.startsWith(path.resolve(dir))) {
      return NextResponse.json({ error: "Path traversal" }, { status: 403 });
    }
    try {
      await stat(filePath);
    } catch {
      return NextResponse.json({ error: "masks.json not found" }, { status: 404 });
    }
  } else {
    filePath = path.join(getProjectRoot(), "public", "masks.json");
  }

  try {
    const raw = await readFile(filePath, "utf8");
    return NextResponse.json(JSON.parse(raw), {
      headers: {
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return NextResponse.json([], {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=60",
      },
    });
  }
}
