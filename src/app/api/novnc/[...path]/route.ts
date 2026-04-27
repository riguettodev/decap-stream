import { type NextRequest, NextResponse } from "next/server"

type Ctx = { params: Promise<{ path: string[] }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { path } = await params
  const searchParams = req.nextUrl.searchParams.toString()
  const query = searchParams ? `?${searchParams}` : ""
  const upstream = `http://localhost:6080/${path.join("/")}${query}`

  try {
    const res = await fetch(upstream, {
      headers: { Accept: req.headers.get("Accept") ?? "*/*" },
    })

    if (!res.ok) return new NextResponse(null, { status: res.status })

    const headers = new Headers()
    const ct = res.headers.get("content-type")
    if (ct) headers.set("content-type", ct)
    headers.set("cache-control", "no-cache")

    return new NextResponse(res.body, { status: 200, headers })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
