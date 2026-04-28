import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";

function isValidDirectory(dir: string): boolean {
  const normalized = path.resolve(dir);
  return normalized === dir || normalized === dir.replace(/[/\\]+$/, "");
}

function createAbortSafeVideoStream(
  filePath: string,
  signal: AbortSignal,
  options?: { start?: number; end?: number },
): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(filePath, options);

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const closeController = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Ignore double-close races when the browser aborts a range request.
        }
      };

      const errorController = (error: unknown) => {
        if (closed) return;
        closed = true;
        try {
          controller.error(error);
        } catch {
          // Ignore controller state races after abort/cancel.
        }
      };

      nodeStream.on("data", (chunk: string | Buffer) => {
        if (closed) return;
        try {
          const data = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          controller.enqueue(new Uint8Array(data));
        } catch {
          closed = true;
          nodeStream.destroy();
        }
      });

      nodeStream.once("end", closeController);
      nodeStream.once("close", closeController);
      nodeStream.once("error", errorController);

      signal.addEventListener(
        "abort",
        () => {
          if (closed) return;
          closed = true;
          nodeStream.destroy();
        },
        { once: true },
      );
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}

/** GET /api/video?dir=<absolute-path> — stream footage.mp4 from the given directory. */
export async function GET(req: NextRequest) {
  const dir = req.nextUrl.searchParams.get("dir");

  if (!dir) {
    return NextResponse.json({ error: "Missing dir param" }, { status: 400 });
  }

  if (!isValidDirectory(dir)) {
    return NextResponse.json({ error: "Invalid directory" }, { status: 400 });
  }

  const filePath = path.join(path.resolve(dir), "footage.mp4");

  if (!filePath.startsWith(path.resolve(dir))) {
    return NextResponse.json({ error: "Path traversal" }, { status: 403 });
  }

  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    return NextResponse.json({ error: "footage.mp4 not found" }, { status: 404 });
  }

  const range = req.headers.get("range");
  const baseHeaders = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
  };

  if (!range) {
    return new NextResponse(createAbortSafeVideoStream(filePath, req.signal), {
      headers: {
        ...baseHeaders,
        "Content-Length": fileStat.size.toString(),
      },
    });
  }

  const match = range.match(/bytes=(\d*)-(\d*)/);
  if (!match) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${fileStat.size}`,
      },
    });
  }

  const start = match[1] ? Number.parseInt(match[1], 10) : 0;
  const requestedEnd = match[2] ? Number.parseInt(match[2], 10) : fileStat.size - 1;
  const end = Math.min(requestedEnd, fileStat.size - 1);

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${fileStat.size}`,
      },
    });
  }

  return new NextResponse(
    createAbortSafeVideoStream(filePath, req.signal, { start, end }),
    {
    status: 206,
    headers: {
      ...baseHeaders,
      "Content-Length": (end - start + 1).toString(),
      "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
    },
  });
}

/**
 * POST /api/video — check that the given directory contains the required files.
 * Body: { dir: string }
 * Returns: { hasVideo, hasLabels, files }
 */
export async function POST(req: NextRequest) {
  const { dir } = await req.json();

  if (!dir || !isValidDirectory(dir)) {
    return NextResponse.json({ error: "Invalid directory" }, { status: 400 });
  }

  try {
    const resolvedDir = path.resolve(dir);
    const videoPath = path.join(resolvedDir, "footage.mp4");
    const masksPath = path.join(resolvedDir, "masks.json");

    const [hasVideo, hasMasks] = await Promise.all([
      stat(videoPath).then(() => true).catch(() => false),
      stat(masksPath).then(() => true).catch(() => false),
    ]);

    return NextResponse.json({ hasVideo, hasMasks });
  } catch {
    return NextResponse.json({ error: "Cannot read directory" }, { status: 404 });
  }
}
