import { readStreams } from "@/lib/db"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const host = searchParams.get("host") ?? "localhost"
  const port = searchParams.get("port") ?? "8888"

  const streams = readStreams()

  const lines = ["#EXTM3U"]
  for (const s of streams) {
    lines.push(`#EXTINF:-1 tvg-id="${s.id}" tvg-name="${s.name}" group-title="DecapStream",${s.name} [${s.id}] ${s.resolution} ${s.fps}fps`)
    lines.push(`http://${host}:${port}/live/${s.id}`)
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "application/x-mpegurl",
      "Content-Disposition": 'attachment; filename="decap-stream.m3u"',
    },
  })
}
