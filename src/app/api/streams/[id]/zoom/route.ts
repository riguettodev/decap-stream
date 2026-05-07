import { NextResponse } from "next/server"
import { getStream, saveStream } from "@/lib/db"
import { applyZoom } from "@/lib/supervisor"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params
  const stream = getStream(id)
  if (!stream) return NextResponse.json({ error: "not found" }, { status: 404 })

  const body = await req.json() as { zoom?: number }
  const z = Number(body.zoom)
  if (!Number.isFinite(z) || z < 0.25 || z > 5) {
    return NextResponse.json({ error: "zoom must be a number in [0.25, 5]" }, { status: 400 })
  }

  const updated = {
    ...stream,
    zoom: z,
    updatedAt: new Date().toISOString(),
  }
  saveStream(updated)
  applyZoom(id)

  return NextResponse.json(updated)
}
