"use client"

import { useEffect, useState } from "react"
import { X, ArrowLeftRight, ArrowRight, Loader2, Video } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Stream } from "@/types/stream"

interface Props {
  stream: Stream
  onClose: () => void
  onRefresh: () => void
  onLocalStatus: (id: string, s: string | null) => void
}

function Thumb({ stream }: { stream: Stream }) {
  const [error, setError] = useState(false)
  return (
    <div className="w-20 aspect-video shrink-0 rounded overflow-hidden bg-muted flex items-center justify-center">
      {error ? (
        <Video className="w-4 h-4 text-muted-foreground/25" />
      ) : (
        <img
          src={`/api/streams/${stream.id}/thumb?t=${stream.updatedAt}`}
          className="w-full h-full object-cover"
          onError={() => setError(true)}
        />
      )}
    </div>
  )
}

export function SwapModal({ stream, onClose, onRefresh, onLocalStatus }: Props) {
  const [others, setOthers] = useState<Stream[]>([])
  const [loading, setLoading] = useState(true)
  const [target, setTarget] = useState<Stream | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/streams")
      .then((r) => r.json())
      .then((data: Stream[]) => setOthers(data.filter((s) => s.id !== stream.id)))
      .finally(() => setLoading(false))
  }, [stream.id])

  async function swap() {
    if (!target) return
    setBusy(true)
    setError(null)
    // only streams that will come back up — a stopped one stays stopped
    const restarting = [stream, target].filter((s) => s.desiredState === "running").map((s) => s.id)
    restarting.forEach((id) => onLocalStatus(id, "restarting"))
    try {
      const r = await fetch(`/api/streams/${stream.id}/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ with: target.id }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "swap failed")
    } catch (e) {
      restarting.forEach((id) => onLocalStatus(id, null))
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
      return
    }
    onRefresh()
    onClose()
    setTimeout(() => restarting.forEach((id) => onLocalStatus(id, null)), 15000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={() => { if (!busy) onClose() }} />
      <div
        className="relative z-10 w-[520px] max-w-[95vw] max-h-[85vh] flex flex-col rounded-xl border border-border shadow-2xl"
        style={{ background: "#1c1c1c" }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex flex-col min-w-0">
            <h2 className="text-sm font-semibold">Swap content</h2>
            <p className="text-xs text-muted-foreground truncate">
              {stream.name} <span className="font-mono">· {stream.id}</span>
            </p>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1 rounded hover:bg-[#2a2a2a] cursor-pointer disabled:opacity-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Name, URL, login, settings, extensions and the Chrome session (cookies) trade places: each card, TV Wall slot
            and TV starts showing what the other one showed.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...
            </div>
          ) : !target ? (
            others.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No other streams to swap with.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {others.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => setTarget(s)}
                      className="w-full flex items-center gap-3 p-2 rounded border border-transparent hover:border-border hover:bg-[#2a2a2a] text-left cursor-pointer transition-colors"
                    >
                      <Thumb stream={s} />
                      <div className="min-w-0 flex flex-col">
                        <span className="text-sm font-medium truncate">{s.name}</span>
                        <span className="text-xs text-muted-foreground font-mono truncate">{s.id}</span>
                        <span className="text-[11px] text-muted-foreground truncate">{s.url}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="flex flex-col gap-2">
              {[
                { screen: stream, from: stream, to: target },
                { screen: target, from: target, to: stream },
              ].map(({ screen, from, to }) => (
                <div key={screen.id} className="flex items-center gap-3 px-3 py-2.5 rounded bg-[#0f0f0f] border border-border text-sm">
                  <span className="font-mono text-xs w-24 shrink-0 truncate" title={screen.id}>{screen.id}</span>
                  <span className="text-muted-foreground truncate line-through decoration-muted-foreground/50" title={from.name}>{from.name}</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  <span className="font-medium truncate" title={to.name}>{to.name}</span>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                Running streams restart — expect a black screen for the stream delay on both TVs.
              </p>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded px-2 py-1.5">{error}</div>
          )}
        </div>

        {target && (
          <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
            <button
              onClick={() => { setTarget(null); setError(null) }}
              disabled={busy}
              className="px-3 py-1.5 rounded border border-border text-xs hover:bg-[#2a2a2a] cursor-pointer disabled:opacity-50"
            >
              Back
            </button>
            <button
              onClick={swap}
              disabled={busy}
              className={cn(
                "px-3 py-1.5 rounded border border-blue-600 bg-blue-600/20 text-blue-300 text-xs transition-colors cursor-pointer flex items-center gap-2",
                busy ? "opacity-50" : "hover:bg-blue-600 hover:text-white",
              )}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowLeftRight className="w-3.5 h-3.5" />}
              {busy ? "Swapping..." : "Swap"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
