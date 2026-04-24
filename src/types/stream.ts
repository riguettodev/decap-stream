export type StreamStatus = "running" | "stopped" | "error" | "starting"

export interface Stream {
  id: string           // slug definido pelo usuário: [a-z0-9-]
  name: string         // nome amigável
  url: string
  user?: string
  pass?: string

  // ffmpeg / xvfb
  delay: number        // segundos antes do ffmpeg iniciar
  resolution: string   // tamanho do Xvfb/Chrome: "1920x1080"
  scale: string        // scale do ffmpeg: "1280:720"
  fps: number
  bitrate: string      // "1500k"
  bufsize: string      // "1500k"
  preset: string       // ultrafast | superfast | veryfast | faster | fast
  tune: string         // stillimage | zerolatency | film
  gop: number

  // alocado pelo sistema em runtime
  display: string      // ":1", ":2"...
  vncPort: number      // 5901, 5902...
  novncPort: number    // 6081, 6082...
  debugPort: number    // 9222, 9223...

  createdAt: string
  updatedAt: string
}

export type StreamCreate = Omit<Stream, "display" | "vncPort" | "novncPort" | "debugPort" | "createdAt" | "updatedAt">
export type StreamUpdate = Partial<StreamCreate>

export const STREAM_DEFAULTS: Omit<StreamCreate, "id" | "name" | "url"> = {
  delay: 15,
  resolution: "1920x1080",
  scale: "1280:720",
  fps: 30,
  bitrate: "1500k",
  bufsize: "3000k",
  preset: "ultrafast",
  tune: "stillimage",
  gop: 60,
}