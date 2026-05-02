import { NextResponse } from "next/server"
import { readStreams, writeStreams } from "@/lib/db"

export async function PUT(req: Request) {
  const { slots }: { slots: (string | null)[] } = await req.json()
  const streams = readStreams()

  const posMap = new Map<string, number>()
  slots.forEach((id, idx) => { if (id) posMap.set(id, idx) })

  const updated = streams.map((s) => ({
    ...s,
    tvPosition: posMap.has(s.id) ? posMap.get(s.id)! : null,
  }))

  writeStreams(updated)
  return NextResponse.json({ ok: true })
}
