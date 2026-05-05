import { type NextRequest, NextResponse } from "next/server"
import { extractIp, touchHlsViewer } from "@/lib/viewers"

type Ctx = { params: Promise<{ path: string[] }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { path } = await params

  if (path.at(-1)?.endsWith(".m3u8")) {
    const ip = extractIp(req)
    const referer = req.headers.get("referer") ?? ""
    const mode = referer.includes("/api/tv-wall") ? "wall"
      : referer.includes("/static/") ? "html"
      : "hls"
    const streamId = path[0] === "live" ? path[1] : path[0]
    if (streamId) touchHlsViewer(streamId, ip, mode)
  }

  const upstream = `http://localhost:8888/${path.join("/")}`

  try {
    const res = await fetch(upstream, {
      headers: { Accept: req.headers.get("Accept") ?? "*/*" },
    })

    if (!res.ok) return new NextResponse(null, { status: res.status })

    const headers = new Headers()
    const ct = res.headers.get("content-type")
    if (ct) headers.set("content-type", ct)

    const cl = res.headers.get("content-length")
    if (cl) headers.set("content-length", cl)
    const ar = res.headers.get("accept-ranges")
    if (ar) headers.set("accept-ranges", ar)

    // .ts segments are immutable — cache them; playlists must stay fresh
    const isSegment = path[path.length - 1]?.endsWith(".ts")
    headers.set("cache-control", isSegment ? "public, max-age=300, immutable" : "no-cache, no-store")

    return new NextResponse(res.body, { status: 200, headers })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
