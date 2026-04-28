import { createReadStream } from "fs";
import { readdir, readFile, stat } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

const JSON_FILES = new Set(["labels_points.json", "masks.json", "labels.json"]);
const VIDEO_FILES = ["footage.mp4", "footage_ft2.mp4", "footage.ft2.mp4", "video.mp4"];

function isValidDirectory(dir: string): boolean {
  const normalized = path.resolve(dir);
  return normalized === dir || normalized === dir.replace(/[\/\\]+$/, "");
}

function createAbortSafeStream(
  filePath: string,
  signal: AbortSignal,
  options?: { start?: number; end?: number },
): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(filePath, options);

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // The browser may abort a range request while the stream is closing.
        }
      };

      const fail = (error: unknown) => {
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
          controller.enqueue(new Uint8Array(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
        } catch {
          closed = true;
          nodeStream.destroy();
        }
      });
      nodeStream.once("end", close);
      nodeStream.once("close", close);
      nodeStream.once("error", fail);

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

async function firstExistingVideo(dir: string): Promise<string | null> {
  for (const file of VIDEO_FILES) {
    try {
      await stat(path.join(dir, file));
      return file;
    } catch {
      // Try the next supported filename.
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const { dir } = await req.json();

  if (!dir || !isValidDirectory(dir)) {
    return NextResponse.json({ error: "Invalid directory" }, { status: 400 });
  }

  const resolvedDir = path.resolve(dir);
  try {
    const [files, videoFile, hasLabels] = await Promise.all([
      readdir(resolvedDir).catch(() => []),
      firstExistingVideo(resolvedDir),
      stat(path.join(resolvedDir, "labels_points.json"))
        .then(() => true)
        .catch(() => false),
    ]);

    return NextResponse.json({
      hasVideo: Boolean(videoFile),
      videoFile,
      hasLabels,
      files,
    });
  } catch {
    return NextResponse.json({ error: "Cannot read directory" }, { status: 404 });
  }
}

export async function GET(req: NextRequest) {
  const dir = req.nextUrl.searchParams.get("dir");
  const file = req.nextUrl.searchParams.get("file");

  if (!dir || !file) {
    return NextResponse.json({ error: "Missing dir or file param" }, { status: 400 });
  }

  if (!isValidDirectory(dir) || file !== path.basename(file)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!JSON_FILES.has(file) && !VIDEO_FILES.includes(file)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 403 });
  }

  const resolvedDir = path.resolve(dir);
  const filePath = path.join(resolvedDir, file);

  if (!filePath.startsWith(resolvedDir + path.sep)) {
    return NextResponse.json({ error: "Path traversal" }, { status: 403 });
  }

  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    return NextResponse.json({ error: `${file} not found` }, { status: 404 });
  }

  if (JSON_FILES.has(file)) {
    try {
      const raw = await readFile(filePath, "utf8");
      return NextResponse.json(JSON.parse(raw), {
        headers: { "Cache-Control": "public, max-age=300" },
      });
    } catch {
      return NextResponse.json([], { status: 200 });
    }
  }

  const range = req.headers.get("range");
  const baseHeaders = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
  };

  if (!range) {
    return new NextResponse(createAbortSafeStream(filePath, req.signal), {
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
      headers: { "Content-Range": `bytes */${fileStat.size}` },
    });
  }

  const start = match[1] ? Number.parseInt(match[1], 10) : 0;
  const requestedEnd = match[2] ? Number.parseInt(match[2], 10) : fileStat.size - 1;
  const end = Math.min(requestedEnd, fileStat.size - 1);

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end) {
    return new NextResponse(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${fileStat.size}` },
    });
  }

  return new NextResponse(createAbortSafeStream(filePath, req.signal, { start, end }), {
    status: 206,
    headers: {
      ...baseHeaders,
      "Content-Length": (end - start + 1).toString(),
      "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
    },
  });
}
