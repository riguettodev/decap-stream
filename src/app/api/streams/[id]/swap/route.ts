import { NextResponse } from "next/server"
import { getStream } from "@/lib/db"
import { swapStreams } from "@/lib/supervisor"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params
  const body = await req.json() as { with?: string }
  const otherId = body.with
  if (typeof otherId !== "string" || otherId === id) {
    return NextResponse.json({ error: "`with` must be the id of another stream" }, { status: 400 })
  }

  const stream = getStream(id)
  const other = getStream(otherId)
  if (!stream || !other) return NextResponse.json({ error: "not found" }, { status: 404 })

  const swapped = swapStreams(stream, other)
  return NextResponse.json(swapped)
}
