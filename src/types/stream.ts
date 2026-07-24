export type StreamStatus = "running" | "stopped" | "error" | "starting" | "restarting" | "stopping"

export interface Stream {
  id: string
  name: string
  url: string
  user?: string
  pass?: string

  delay: number        // seconds before ffmpeg starts (stream boot delay)
  resolution: string   // Xvfb/Chrome window size: "1920x1080"
  scale: string        // ffmpeg output scale: "1280x720" (stored as "1280:720" internally)
  fps: number
  bitrate: string
  bufsize: string
  preset: string
  tune: string
  gop: number
  threads: number

  display: string
  vncPort: number
  debugPort: number

  gpu: boolean  // @deprecated — kept for rollback/back-compat; derived from gpuMode (gpu === (gpuMode === "hardware"))
  // Chromium rendering backend. Default "off" (--disable-gpu, lowest CPU, no WebGL).
  // "software" = SwiftShader CPU WebGL — maps/WebGL work without a GPU, but CPU-heavy.
  // "hardware" = no --disable-gpu — needs a real GPU exposed to the container.
  // Absent → derived from the legacy `gpu` boolean (true → "hardware", false → "off").
  gpuMode?: "off" | "software" | "hardware"

  // Per-stream display backend. "xvfb" (default) = software-only X; "wayland" =
  // sway + rootful Xwayland, which gives the X server DRI3 and real GPU rendering
  // (pair with gpuMode "hardware"). Absent → falls back to the DISPLAY_BACKEND env.
  // NB: GPU rendering only helps WebGL/GL workloads (maps). It HURTS pages that
  // decode video into <canvas> (camera portals): VA-API can't touch canvas frames
  // and GPU compositing of large canvases costs more CPU. Decide per stream.
  displayBackend?: "xvfb" | "wayland"

  zoom?: number  // Chromium --force-device-scale-factor; default 1.0; range 0.25–5.0

  autoReload?: boolean
  autoReloadInterval?: number  // seconds

  extensions?: {
    unpacked?: string[]   // slug names of dirs in /app/data/extensions/{streamId}/
    forcelist?: string[]  // Web Store IDs (32 chars [a-p])
  }

  desiredState: "running" | "stopped"  // persisted desired state, restored on container restart

  order: number
  tvPosition?: number | null  // TV Layout: absolute slot index (0-based), null = auto-placed

  tvFill?: boolean                            // TV Wall: true = object-fit cover; false = contain (default false)
  tvAlign?: "left" | "center" | "right"       // TV Wall: object-position when !tvFill (default "center")

  createdAt: string
  updatedAt: string
}

export type StreamCreate = Omit<Stream, "display" | "vncPort" | "debugPort" | "createdAt" | "updatedAt" | "desiredState" | "order">
export type StreamUpdate = Partial<StreamCreate>

export type ViewerMode = "hls" | "html" | "vnc" | "wall"
export interface ViewerSession {
  ip: string
  streamId: string
  mode: ViewerMode
  // Only set when mode === "wall" — identifies which TV preset is being viewed.
  presetId?: string
  connectedAt: number
  lastSeenAt: number
}

export interface ViewerEntry {
  ip: string
  mode: ViewerMode
  presetId?: string
  connectedAt: number
  lastSeenAt: number
  durationMs: number
}
export interface ViewersResponse {
  total: number
  streams: Record<string, { count: number; viewers: ViewerEntry[] }>
}

declare global {
  var __vncViewers: Map<string, ViewerSession> | undefined
}

export const STREAM_DEFAULTS: Omit<StreamCreate, "id" | "name" | "url"> = {
  delay: 15,
  resolution: "1920x1080",
  scale: "1280x720",
  fps: 30,
  bitrate: "1500k",
  bufsize: "3000k",
  preset: "ultrafast",
  tune: "stillimage",
  gop: 60,
  threads: 0,
  gpu: false,
  gpuMode: "off",
  displayBackend: "xvfb",
  zoom: 1.0,
  tvFill: false,
  tvAlign: "center",
}
