# CARDIOVIS

A surgical video hazard-awareness tool. Plays endoscopy footage while rendering real-time boundary polygon overlays, RLE segmentation masks, and animated danger-zone indicators synced to each video frame.

---

## Running the Application

### Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io/) (recommended) or npm

### Install dependencies

```bash
pnpm install
```

### Development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production build

```bash
pnpm build
pnpm start
```

### Docker

Build:

```bash
docker build -t copilot-mvp .
```

Run locally:

```bash
docker run --rm -p 3000:7860 copilot-mvp
```

Then open [http://localhost:3000](http://localhost:3000).

Push to Docker Hub:

```bash
docker tag copilot-mvp <your-dockerhub-user>/copilot-mvp:latest
docker push <your-dockerhub-user>/copilot-mvp:latest
```

Notes:

- The image listens on port `7860`, which works well for Hugging Face Docker Spaces.
- `Feature_1/` and `Feature_3/` are bundled into the image for local runs.
- If `DATA_DIR` points to a mounted bucket path such as `/data`, the app prefers that data first and falls back to bundled feature folders when the mounted folder is absent.
- `Feature_2` stays disabled until its assets/component exist.

### Lint

```bash
pnpm lint
```

---

## Environment Variables

Set these in a `.env.local` file (or equivalent) before starting the server:

| Variable | Description |
|---|---|
| `DEFAULT_VIDEO_DIR` | Absolute path to a directory containing `footage.mp4` and `points.json`. Pre-fills the video tab on first load. |
| `DEFAULT_GALLERY_DIR` | Absolute path to a directory used by the image gallery tab. Pre-fills the gallery path and is used for server-side mask pre-fetching. |

Both variables are optional. Without them the application starts with empty directory inputs.

---

## Loading Data

### Hazard Awareness (Video Player tab)

- The player looks for `footage.mp4` in the configured directory and streams it via `/api/video`.
- Boundary polygons are loaded from `points.json` (served by `/api/points`).
- Segmentation masks are loaded from `masks.json` (served by `/api/masks`).
- Overlays are drawn on a canvas stacked above the `<video>` element and updated every animation frame.

Expected directory layout:

```
<videoDir>/
  footage.mp4
  points.json         — polygon annotations per frame
  masks.json          — RLE segmentation masks per frame (optional)
```

### Dataset Preview (Image Gallery tab)

- Browses frame images from a local directory via `/api/images`.
- Expects images directly in the chosen directory (PNG, JPG, JPEG, GIF, WebP, SVG, AVIF).
- Loads `masks.json` and `points.json` from the same directory for per-frame overlays.
- Toggle **Show Segmentation**, **Show Boundary**, and **Show Lines** to layer overlays on the selected frame.
- Overlay renders are cached as data-URLs so each frame is only decoded once.

Expected directory layout:

```
<galleryDir>/
  frames/
    frame_000001.png  — frame images (any supported extension)
    frame_000002.png
    ...
  masks.json          — RLE segmentation masks (optional)
  points.json         — boundary polygons and line annotations (optional)
```

---

## Data Formats

**`points.json`** — array of per-frame records:
```json
[
  {
    "id": 0,
    "image": "frame_000000.png",
    "zones": [{ "label": "Phrenic nerve", "points": [[{"x": 0.4, "y": 0.3}, ...] }], [...]],
    "lines": [{ "label": "Incision line", "points": [{"x": 0.1, "y": 0.5}, ...] }]
  }
]
```
Points are normalised to `[0, 1]` relative to the image dimensions. `zones[].points` is an array of polygon rings (array of arrays); `lines[].points` is a flat array.

**`masks.json`** — RLE segmentation masks per frame:
```json
[
  {
    "id": 0,
    "image": "frame_000000.png",
    "tags": [{ "label": "Phrenic nerve", "rle": [12345, ...] }]
  }
]
```

---

## Utility Scripts

### `scripts/process_features.js`

Converts a directory of raw frame images and binary mask PNGs into `masks.json` and `points.json`.

```
<projectDir>/
  frames/               — frame_NNNNNN.png
  masks/
    class01_<name>/     — class01_NNNNNN.png  (binary 0/255 mask)
    class02_<name>/
    ...
  json/                 — ann_NNNNNN.json (optional, for class name mapping)
```

```bash
node scripts/process_features.js [projectDir] [--epsilon=7] [--start=N] [--end=N]
```

Outputs `masks.json` and `points.json` into `<projectDir>/`.

### `scripts/frames_to_video.js`

Assembles a `footage.mp4` from a `frames/` sub-folder using ffmpeg.

```bash
node scripts/frames_to_video.js [projectDir] [--fps=18] [--start=N] [--end=N]
```

Requires `ffmpeg` on `PATH`. Outputs `<projectDir>/footage.mp4`.

---

## Project Structure

```
app/
  layout.tsx              Root Next.js layout
  page.tsx                Home page — pre-fetches masks/points server-side, renders AICopilotLayout
  api/
    images/route.ts       List frame images or serve a single image from a local directory
    masks/route.ts        Serve masks.json from a given directory (or public/ fallback)
    points/route.ts       Serve points.json from a given directory (or public/ fallback)
    video/route.ts        Stream footage.mp4 from a given directory with HTTP range support

components/
  AICopilotLayout.tsx     Root client layout — owns tab state, renders TaskBar + active tab
  TaskBar.tsx             Top header — tab navigation (Hazard Awareness / Dataset Preview)
  SideBar.tsx             Left panel — surgery phase display and zone list by category
  VideoPlayerTab.tsx      Video player with per-frame boundary, segmentation/RLE, and line overlays
  ImageGalleryTab.tsx     Frame browser with cached per-frame overlay rendering

lib/
  types.ts                Core types: Point, Zone, ZoneFillStyle; SafeZone / DangerZone / OtherZone / HiddenZone classes
  ZoneFactory.ts          classifyZone() and createClassifiedZone() — maps label strings to zone categories
  BoundaryAnimationManager.ts  Per-zone animation state: danger flash (blink + label zoom), label smoothing
  boundaryOverlay.ts      Canvas renderer for boundary polygons and line annotations
  segmentationOverlay.ts  Canvas renderer for RLE-decoded segmentation masks with label badges
  ImageTools.ts           Colour utilities (parseHex, lerpRgb, lerpHexColor), canvas helpers, colour maps
  overlayConfig.ts        Central rendering constants — line widths, opacities, dash patterns, label sets

scripts/
  process_features.js     Convert frame images + mask PNGs → masks.json + points.json
  frames_to_video.js      Assemble frames/ folder → footage.mp4 via ffmpeg

google-apps-script.js     Google Apps Script (doGet/doPost) for optional Drive-based zone file sync

  BoundaryAnimationManager.ts  Per-zone animation state machine for video overlay (flash, zoom, smoothing)
  rleDecoder.ts           Label Studio RLE decoder; canvas renderers for segmentation, boundary, and line overlays
  services/
    ZonePersistenceService.ts  Service — Google Drive read/write, clipboard export/import

scripts/                  Standalone Node.js data-processing CLI tools
  parse_data.js           Trim a Label Studio JSON export to required fields
  parse_rle.js            Decode RLE masks → contours (Moore-Neighbour + Douglas-Peucker)
  process_features.js     Full pipeline: encode masks to RLE + trace contours
  frames_to_video.js      Concatenate frame images to footage.mp4 using ffmpeg
  copy_postfix.js         Rename/copy files by postfix (dataset organisation utility)
```

---

## Zone Categories

Zones are automatically classified by label name using sets defined in `lib/overlayConfig.ts`:

| Category | Colour  | Behaviour |
|----------|---------|-----------|
| Danger   | Red     | Flash animation on first appearance, warning triangle badge |
| Safe     | Green   | Rendered with gradient corridor; hidden by default in video player |
| Other    | Orange  | No animation |
| Unknown  | Purple  | No animation |
