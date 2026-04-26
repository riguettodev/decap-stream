import { NextResponse } from "next/server"
import { AUTH_ENABLED } from "@/lib/auth"

export async function GET() {
  return NextResponse.json({ enabled: AUTH_ENABLED })
}
