"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { MoreHorizontal, Play, Globe, FileVideo, Monitor, Pencil, RotateCcw, Square, Trash2, Circle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Stream } from "@/types/stream"

interface Props {
  stream: Stream
  status?: Record<string, string>
  onRefresh: () => void
}

function StatusBadge({ status }: { status?: Record<string, string> }) {
  if (!status) return null
  const ffmpeg = status.ffmpeg
  const color =
    ffmpeg === "RUNNING" ? "bg-green-500" :
    ffmpeg === "STARTING" ? "bg-yellow-500" :
    ffmpeg === "FATAL" ? "bg-red-500" :
    "bg-zinc-500"
  const label =
    ffmpeg === "RUNNING" ? "running" :
    ffmpeg === "STARTING" ? "starting" :
    ffmpeg === "FATAL" ? "error" :
    "stopped"
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Circle className={cn("w-2 h-2 fill-current", color)} />
      {label}
    </span>
  )
}

export function StreamCard({ stream, status, onRefresh }: Props) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)

  async function action(act: string) {
    setLoading(act)
    await fetch(`/api/streams/${stream.id}/${act}`, { method: "POST" })
    setLoading(null)
    onRefresh()
  }

  async function remove() {
    if (!confirm(`Deletar stream "${stream.name}"?`)) return
    await fetch(`/api/streams/${stream.id}`, { method: "DELETE" })
    onRefresh()
  }

  function openVNC() {
    const host = window.location.hostname
    window.open(`http://${host}:${stream.novncPort}/vnc.html`, "_blank")
  }

  return (
    <div className="relative rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold truncate">{stream.name}</p>
          <p className="text-xs text-muted-foreground font-mono truncate">{stream.id}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={status} />
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1 rounded hover:bg-accent transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* URL */}
      <p className="text-xs text-muted-foreground truncate" title={stream.url}>{stream.url}</p>

      {/* Play buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => router.push(`/player/${stream.id}?mode=hls`)}
          className="flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded bg-accent hover:bg-accent/80 transition-colors"
        >
          <Play className="w-3 h-3" /> Play HLS
        </button>
        <button
          onClick={() => router.push(`/player/${stream.id}?mode=html`)}
          className="flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded bg-accent hover:bg-accent/80 transition-colors"
        >
          <Globe className="w-3 h-3" /> Play HTML
        </button>
        <button
          onClick={() => router.push(`/player/${stream.id}?mode=m3u8`)}
          className="flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded bg-accent hover:bg-accent/80 transition-colors"
        >
          <FileVideo className="w-3 h-3" /> Play m3u8
        </button>
        <button
          onClick={openVNC}
          className="flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded bg-accent hover:bg-accent/80 transition-colors"
        >
          <Monitor className="w-3 h-3" /> Open VNC
        </button>
      </div>

      {/* Dropdown menu */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute top-10 right-4 z-20 min-w-[160px] rounded-lg border border-border bg-card shadow-lg overflow-hidden">
            <button
              onClick={() => { setMenuOpen(false); router.push(`/streams/${stream.id}/edit`) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
            <button
              onClick={() => { setMenuOpen(false); action("restart") }}
              disabled={!!loading}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Restart
            </button>
            {status?.ffmpeg === "RUNNING" ? (
              <button
                onClick={() => { setMenuOpen(false); action("stop") }}
                disabled={!!loading}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <Square className="w-3.5 h-3.5" /> Stop
              </button>
            ) : (
              <button
                onClick={() => { setMenuOpen(false); action("start") }}
                disabled={!!loading}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <Play className="w-3.5 h-3.5" /> Start
              </button>
            )}
            <div className="border-t border-border" />
            <button
              onClick={() => { setMenuOpen(false); remove() }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-accent transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Deletar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
