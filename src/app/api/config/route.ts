import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    pureMode: process.env.DEFAULT_PURE_MODE === "true",
    newTab: process.env.DEFAULT_OPEN_NEW_TAB === "true",
    autoReload: process.env.DEFAULT_RELOAD_CLIENT === "true",
    reloadInterval: Math.max(1, Number(process.env.DEFAULT_RELOAD_CLIENT_TIME) || 2),
  })
}
