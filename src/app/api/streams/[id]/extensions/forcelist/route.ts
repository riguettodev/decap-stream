import { NextResponse } from "next/server"
import { getStream, saveStream } from "@/lib/db"
import { FORCELIST_ID_RE } from "@/lib/extensions"

type Ctx = { params: Promise<{ id: string }> }

function parseIds(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const raw of input) {
    if (typeof raw !== "string") continue
    // Accept Web Store URL or raw ID
    const m = raw.match(/[a-p]{32}/)
    if (m && FORCELIST_ID_RE.test(m[0])) out.push(m[0])
  }
  return Array.from(new Set(out))
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params
  const stream = getStream(id)
  if (!stream) return NextResponse.json({ error: "not found" }, { status: 404 })

  const body = (await req.json()) as { ids?: unknown }
  const ids = parseIds(body.ids)

  const updated = {
    ...stream,
    extensions: { ...(stream.extensions ?? {}), forcelist: ids },
    updatedAt: new Date().toISOString(),
  }
  saveStream(updated)

  return NextResponse.json({ forcelist: ids })
}
