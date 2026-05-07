import { NextResponse } from "next/server"
import { readPresetsFile, createPreset } from "@/lib/tvPresets"

export async function GET() {
  return NextResponse.json(readPresetsFile())
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body?.name || typeof body.name !== "string") {
      return NextResponse.json({ error: "name required" }, { status: 400 })
    }
    const preset = createPreset({
      name: body.name,
      rows: body.rows,
      cols: body.cols,
      clickAction: body.clickAction,
      slots: body.slots,
    })
    return NextResponse.json(preset, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
