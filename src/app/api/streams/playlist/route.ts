import { readStreams } from "@/lib/db"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const host = searchParams.get("host") ?? "localhost"
  const port = searchParams.get("port") ?? "8888"

  const streams = readStreams()

  const lines = ["#EXTM3U"]
  for (const s of streams) {
    lines.push(`#EXTINF:-1,${s.name}`)
    lines.push(`http://${host}:${port}/live/${s.id}/index.m3u8`)
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "application/x-mpegurl",
      "Content-Disposition": 'attachment; filename="decap-stream.m3u"',
    },
  })
}
