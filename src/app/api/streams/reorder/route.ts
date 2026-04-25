import { NextResponse } from "next/server"
import { readStreams, writeStreams } from "@/lib/db"

export async function PUT(req: Request) {
  const { ids } = (await req.json()) as { ids: string[] }

  if (!Array.isArray(ids))
    return NextResponse.json({ error: "ids must be an array" }, { status: 400 })

  const streams = readStreams()
  const streamMap = new Map(streams.map((s) => [s.id, s]))

  ids.forEach((id, i) => {
    const s = streamMap.get(id)
    if (s) s.order = i
  })

  writeStreams(streams.sort((a, b) => a.order - b.order))
  return NextResponse.json({ ok: true })
}
