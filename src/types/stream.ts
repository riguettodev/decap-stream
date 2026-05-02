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

  gpu: boolean

  autoReload?: boolean
  autoReloadInterval?: number  // seconds

  desiredState: "running" | "stopped"  // persisted desired state, restored on container restart

  order: number
  tvPosition?: number | null  // TV Layout: absolute slot index (0-based), null = auto-placed

  createdAt: string
  updatedAt: string
}

export type StreamCreate = Omit<Stream, "display" | "vncPort" | "debugPort" | "createdAt" | "updatedAt" | "desiredState" | "order">
export type StreamUpdate = Partial<StreamCreate>

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
}
