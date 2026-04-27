import { NextResponse } from "next/server"
import { getAllStreamStatuses } from "@/lib/supervisor"

export async function GET() {
  return NextResponse.json(getAllStreamStatuses())
}
