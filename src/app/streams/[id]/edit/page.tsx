import { notFound } from "next/navigation"
import { getStream } from "@/lib/db"
import { StreamForm } from "@/components/StreamForm"

export default async function EditStreamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const stream = getStream(id)
  if (!stream) notFound()
  return <StreamForm initial={stream} />
}
