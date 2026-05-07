import { NextResponse } from "next/server"
import { getStream } from "@/lib/db"
import { listUnpackedSlugs } from "@/lib/extensions"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params
  const stream = getStream(id)
  if (!stream) return NextResponse.json({ error: "not found" }, { status: 404 })

  // Persisted state
  const persistedUnpacked = stream.extensions?.unpacked ?? []
  // Filesystem ground truth (in case persisted is stale)
  const fsUnpacked = listUnpackedSlugs(id)
  const unpacked = Array.from(new Set([...persistedUnpacked, ...fsUnpacked])).filter(
    (s) => fsUnpacked.includes(s)
  )

  return NextResponse.json({
    unpacked,
    forcelist: stream.extensions?.forcelist ?? [],
  })
}
