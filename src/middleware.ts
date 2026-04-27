import { type NextRequest, NextResponse } from "next/server"
import { AUTH_ENABLED, COOKIE_NAME, computeSessionToken } from "@/lib/auth"

const PUBLIC = ["/login", "/api/auth/login"]
const PUBLIC_PREFIX = ["/_next/", "/favicon", "/icon", "/apple-touch", "/web-app-manifest"]

export async function middleware(request: NextRequest) {
  if (!AUTH_ENABLED) return NextResponse.next()

  const { pathname } = request.nextUrl
  if (PUBLIC.includes(pathname) || PUBLIC_PREFIX.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const cookie = request.cookies.get(COOKIE_NAME)?.value
  const expected = await computeSessionToken()

  if (!cookie || cookie !== expected) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("from", pathname)
    return NextResponse.redirect(url)
  }

  // Rolling session — refresh cookie only on page navigations, not API/HLS/asset requests
  if (pathname.startsWith("/api/") || pathname.startsWith("/player")) {
    return NextResponse.next()
  }
  const res = NextResponse.next()
  res.cookies.set(COOKIE_NAME, cookie, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
}
