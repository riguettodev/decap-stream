import { NextResponse } from "next/server"
import { reorderPresets } from "@/lib/tvPresets"

export async function PUT(req: Request) {
  try {
    const body = await req.json()
    if (!Array.isArray(body?.ids)) {
      return NextResponse.json({ error: "ids[] required" }, { status: 400 })
    }
    reorderPresets(body.ids)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
