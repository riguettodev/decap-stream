import crypto from "crypto"
import { type NextRequest, NextResponse } from "next/server"
import { AUTH_ENABLED, COOKIE_NAME, computeSessionToken } from "@/lib/auth"

function hash(s: string) {
  return crypto.createHash("sha256").update(s).digest()
}

export async function POST(request: NextRequest) {
  if (!AUTH_ENABLED) {
    return NextResponse.json({ ok: true })
  }

  let user: string, pass: string
  try {
    const body = await request.json()
    user = String(body.user ?? "")
    pass = String(body.pass ?? "")
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  try {
    const userOk = crypto.timingSafeEqual(hash(user), hash(process.env.AUTH_USER!))
    const passOk = crypto.timingSafeEqual(hash(pass), hash(process.env.AUTH_PASS!))
    if (!userOk || !passOk) throw new Error()
  } catch {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  }

  const token = await computeSessionToken()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days — auto-renewed on every request (rolling session)
  })
  return res
}
