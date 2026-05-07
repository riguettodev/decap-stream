import { NextResponse } from "next/server"
import { selectPreset } from "@/lib/tvPresets"

export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const id: string | null = body?.id ?? null
    const ok = selectPreset(id)
    if (!ok) return NextResponse.json({ error: "preset not found" }, { status: 404 })
    return NextResponse.json({ ok: true, selectedPresetId: id })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
