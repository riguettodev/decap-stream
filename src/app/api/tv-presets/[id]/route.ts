import { NextResponse } from "next/server"
import { getPreset, updatePreset, deletePreset } from "@/lib/tvPresets"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params
  const preset = getPreset(id)
  if (!preset) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json(preset)
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params
  if (!getPreset(id)) return NextResponse.json({ error: "not found" }, { status: 404 })
  try {
    const body = await req.json()
    const updated = updatePreset(id, {
      name: body.name,
      rows: body.rows,
      cols: body.cols,
      clickAction: body.clickAction,
      slots: body.slots,
    })
    return NextResponse.json(updated)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params
  const ok = deletePreset(id)
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
