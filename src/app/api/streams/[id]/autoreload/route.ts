import { NextResponse } from "next/server"
import { getStream, saveStream } from "@/lib/db"
import { provisionStream, applyAutoReload } from "@/lib/supervisor"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params
  const stream = getStream(id)
  if (!stream) return NextResponse.json({ error: "not found" }, { status: 404 })

  const { enabled, interval } = await req.json() as { enabled: boolean; interval?: number }
  const updated = {
    ...stream,
    autoReload: enabled,
    ...(interval !== undefined ? { autoReloadInterval: interval } : {}),
    updatedAt: new Date().toISOString(),
  }
  saveStream(updated)
  provisionStream(updated)
  applyAutoReload(id)

  return NextResponse.json(updated)
}
