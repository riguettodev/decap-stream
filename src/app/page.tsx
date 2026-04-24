"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Plus, Download, RefreshCw } from "lucide-react"
import { StreamCard } from "@/components/StreamCard"
import type { Stream } from "@/types/stream"

export default function GalleryPage() {
  const router = useRouter()
  const [streams, setStreams] = useState<Stream[]>([])
  const [statuses, setStatuses] = useState<Record<string, Record<string, string>>>({})
  const [loading, setLoading] = useState(true)

  const fetchStreams = useCallback(async () => {
    const res = await fetch("/api/streams")
    const data: Stream[] = await res.json()
    setStreams(data)
    setLoading(false)
  }, [])

  const fetchStatuses = useCallback(async (list: Stream[]) => {
    const results = await Promise.all(
      list.map(async (s) => {
        const res = await fetch(`/api/streams/${s.id}/status`)
        const data = await res.json()
        return [s.id, data] as const
      })
    )
    setStatuses(Object.fromEntries(results))
  }, [])

  useEffect(() => {
    fetchStreams()
  }, [fetchStreams])

  useEffect(() => {
    if (streams.length === 0) return
    fetchStatuses(streams)
    const interval = setInterval(() => fetchStatuses(streams), 10000)
    return () => clearInterval(interval)
  }, [streams, fetchStatuses])

  function downloadPlaylist() {
    const host = window.location.hostname
    window.location.href = `/api/streams/playlist?host=${host}&port=8888`
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">DecapStream</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchStreams() }}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border border-border hover:bg-accent transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={downloadPlaylist}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border border-border hover:bg-accent transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Playlist .m3u
          </button>
          <button
            onClick={() => router.push("/streams/new")}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Nova stream
          </button>
        </div>
      </header>

      {/* Grid */}
      <main className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
            Carregando...
          </div>
        ) : streams.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <p className="text-sm">Nenhuma stream configurada.</p>
            <button
              onClick={() => router.push("/streams/new")}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Nova stream
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {streams.map((s) => (
              <StreamCard
                key={s.id}
                stream={s}
                status={statuses[s.id]}
                onRefresh={fetchStreams}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
