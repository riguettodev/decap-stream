import { NextResponse } from "next/server"
import { getStream, saveStream } from "@/lib/db"

type Ctx = { params: Promise<{ id: string }> }

const ALIGNS = ["left", "center", "right"] as const
type Align = typeof ALIGNS[number]

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params
  const stream = getStream(id)
  if (!stream) return NextResponse.json({ error: "not found" }, { status: 404 })

  let body: { fill?: unknown; align?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  const patch: Partial<typeof stream> = {}

  if (body.fill !== undefined) {
    if (typeof body.fill !== "boolean") {
      return NextResponse.json({ error: "fill must be boolean" }, { status: 400 })
    }
    patch.tvFill = body.fill
  }

  if (body.align !== undefined) {
    if (typeof body.align !== "string" || !ALIGNS.includes(body.align as Align)) {
      return NextResponse.json({ error: "align must be 'left' | 'center' | 'right'" }, { status: 400 })
    }
    patch.tvAlign = body.align as Align
  }

  const updated = {
    ...stream,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  saveStream(updated)

  return NextResponse.json(updated)
}
