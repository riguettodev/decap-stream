"use client"

import { useEffect, useState, useCallback } from "react"
import { Plus, Download, RefreshCw, Settings, X, LogOut } from "lucide-react"
import { StreamCard } from "@/components/StreamCard"
import { Toggle } from "@/components/Toggle"
import type { Stream } from "@/types/stream"
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

type CardSize = "mini" | "sm" | "md" | "lg"
type GlobalPrefs = { pureMode: boolean; newTab: boolean; autoReload: boolean; reloadInterval: number }

const DEFAULT_GLOBAL_PREFS: GlobalPrefs = { pureMode: false, newTab: false, autoReload: false, reloadInterval: 2 }

const CARD_WIDTHS: Record<CardSize, string> = { mini: "max-w-[200px]", sm: "max-w-[240px]", md: "max-w-[300px]", lg: "max-w-[380px]" }

function SortableStreamCard(props: {
  stream: Stream
  status?: Record<string, string>
  localStatus?: string | null
  cardSize: CardSize
  onRefresh: () => void
  onLocalStatus: (id: string, s: string | null) => void
  globalPrefs: GlobalPrefs
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.stream.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style} className={`w-full ${CARD_WIDTHS[props.cardSize]}`}>
      <StreamCard
        {...props}
        dragHandleListeners={listeners}
        dragHandleAttributes={attributes}
        isDragging={isDragging}
      />
    </div>
  )
}

function SkeletonCard({ size = "sm" }: { size?: CardSize }) {
  const widths = { mini: "max-w-[200px]", sm: "max-w-[240px]", md: "max-w-[300px]", lg: "max-w-[380px]" }
  return (
    <div className={`rounded-lg border border-border bg-card p-3 flex flex-col gap-2.5 w-full ${widths[size]} animate-pulse`}>
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-1.5">
          <div className="h-4 w-28 bg-muted rounded" />
          <div className="h-3 w-16 bg-muted rounded" />
        </div>
        <div className="h-3 w-12 bg-muted rounded" />
      </div>
      <div className="h-3 w-full bg-muted rounded" />
      <div className="flex flex-col gap-1.5">
        {[...Array(4)].map((_, i) => <div key={i} className="h-8 w-full bg-muted rounded" />)}
      </div>
    </div>
  )
}

function SettingsPopup({ cardSize, onCardSize, globalPrefs, onGlobalPrefs, authEnabled, onDownloadPlaylist, onLogout, onClose }: {
  cardSize: CardSize
  onCardSize: (s: CardSize) => void
  globalPrefs: GlobalPrefs
  onGlobalPrefs: (patch: Partial<GlobalPrefs>) => void
  authEnabled: boolean
  onDownloadPlaylist: () => void
  onLogout: () => void
  onClose: () => void
}) {
  const toggleRow = "flex items-center gap-2 w-full px-1 py-1.5 rounded hover:bg-[#2a2a2a] transition-colors cursor-pointer text-sm"

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed top-16 right-6 z-50 w-64 rounded-lg border border-border shadow-2xl p-4 flex flex-col gap-4" style={{ background: "#1c1c1c" }}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Settings</p>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#2a2a2a] cursor-pointer transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground tracking-wider uppercase">Card size</p>
          <div className="flex gap-2">
            {(["mini", "sm", "md", "lg"] as CardSize[]).map((s) => (
              <button
                key={s}
                onClick={() => onCardSize(s)}
                className="flex-1 py-1.5 rounded border text-xs transition-colors cursor-pointer"
                style={cardSize === s
                  ? { background: "#ededed", color: "#0a0a0a", borderColor: "#ededed" }
                  : {}}
              >
                {s === "mini" ? "Mini" : s === "sm" ? "Small" : s === "md" ? "Medium" : "Big"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground tracking-wider uppercase">Cards</p>
          <button onClick={() => onGlobalPrefs({ pureMode: !globalPrefs.pureMode })} className={toggleRow}>
            <Toggle on={globalPrefs.pureMode} />
            <span>Pure mode</span>
          </button>
          <button onClick={() => onGlobalPrefs({ newTab: !globalPrefs.newTab })} className={toggleRow}>
            <Toggle on={globalPrefs.newTab} />
            <span>Open in new tab</span>
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground tracking-wider uppercase">Player</p>
          <button onClick={() => onGlobalPrefs({ autoReload: !globalPrefs.autoReload })} className={toggleRow}>
            <Toggle on={globalPrefs.autoReload} />
            <span>Auto-reload</span>
          </button>
          {globalPrefs.autoReload && (
            <div className="flex items-center gap-2 px-1 py-1">
              <span className="text-xs text-muted-foreground">Interval</span>
              <input
                type="number"
                min={1}
                value={globalPrefs.reloadInterval}
                onChange={(e) => onGlobalPrefs({ reloadInterval: Math.max(1, Number(e.target.value) || 1) })}
                className="w-14 px-2 py-1 text-xs rounded border border-border bg-muted text-center"
              />
              <span className="text-xs text-muted-foreground">min</span>
            </div>
          )}
        </div>

        <div className="border-t border-border pt-3 flex flex-col gap-1">
          <button onClick={onDownloadPlaylist} className="flex items-center gap-2 w-full px-1 py-1.5 rounded hover:bg-[#2a2a2a] transition-colors cursor-pointer text-sm">
            <Download className="w-3.5 h-3.5" /> Download playlist
          </button>
          {authEnabled && (
            <button onClick={onLogout} className="flex items-center gap-2 w-full px-1 py-1.5 rounded hover:bg-[#2a2a2a] transition-colors cursor-pointer text-sm text-muted-foreground">
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          )}
        </div>
      </div>
    </>
  )
}

export default function GalleryPage() {
  const [streams, setStreams] = useState<Stream[]>([])
  const [statuses, setStatuses] = useState<Record<string, Record<string, string>>>({})
  const [localStatuses, setLocalStatuses] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [cardSize, setCardSize] = useState<CardSize>("md")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [authEnabled, setAuthEnabled] = useState(false)
  const [globalPrefs, setGlobalPrefs] = useState<GlobalPrefs>(DEFAULT_GLOBAL_PREFS)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = streams.findIndex((s) => s.id === active.id)
    const newIndex = streams.findIndex((s) => s.id === over.id)
    const reordered = arrayMove(streams, oldIndex, newIndex)
    setStreams(reordered)
    await fetch("/api/streams/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: reordered.map((s) => s.id) }),
    })
  }

  useEffect(() => {
    try {
      const savedSize = localStorage.getItem("cardSize") as CardSize | null
      if (savedSize) setCardSize(savedSize)
      const savedPrefs = localStorage.getItem("global-prefs")
      if (savedPrefs) setGlobalPrefs({ ...DEFAULT_GLOBAL_PREFS, ...JSON.parse(savedPrefs) })
    } catch {}
  }, [])

  function updateGlobalPrefs(patch: Partial<GlobalPrefs>) {
    setGlobalPrefs(prev => {
      const next = { ...prev, ...patch }
      localStorage.setItem("global-prefs", JSON.stringify(next))
      return next
    })
  }

  const fetchStreams = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    const res = await fetch("/api/streams")
    const data: Stream[] = await res.json()
    setStreams(data)
    setLoading(false)
    if (manual) setRefreshing(false)
  }, [])

  const fetchStatuses = useCallback(async (list: Stream[]) => {
    if (list.length === 0) return
    const res = await fetch("/api/streams/statuses")
    const data: Record<string, Record<string, string>> = await res.json()
    setStatuses(data)
  }, [])

  useEffect(() => {
    fetchStreams()
    fetch("/api/auth/status").then(r => r.json()).then(d => setAuthEnabled(d.enabled))
  }, [fetchStreams])

  useEffect(() => {
    if (streams.length === 0) return
    fetchStatuses(streams)
    const interval = setInterval(() => fetchStatuses(streams), 10000)
    return () => clearInterval(interval)
  }, [streams, fetchStatuses])

  const setLocalStatus = useCallback((id: string, s: string | null) => {
    setLocalStatuses((prev) => ({ ...prev, [id]: s }))
  }, [])

  function downloadPlaylist() {
    window.location.href = `/api/streams/playlist?host=${window.location.hostname}&port=8888`
  }

  const showSkeleton = loading || refreshing

  const btnBase = "flex items-center gap-1.5 text-sm px-3 py-1.5 h-8 rounded border border-border hover:bg-[#2a2a2a] active:bg-[#333] transition-colors cursor-pointer"
  const btnPrimary = "flex items-center gap-1.5 text-sm px-3 py-1.5 h-8 rounded border border-primary bg-primary text-primary-foreground hover:bg-[#2a2a2a] hover:text-foreground hover:border-border active:bg-[#333] transition-colors cursor-pointer"

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/web-app-manifest-192x192.png" alt="Decap Stream" className="w-6 h-6 rounded" />
          <h1 className="text-lg font-semibold tracking-tight">Decap Stream</h1>
          <span className="text-muted-foreground/40 text-sm select-none">·</span>
          <a href="https://riguetto.dev" target="_blank" rel="noopener noreferrer" className="text-xs text-[#888] hover:text-[#ededed] hover:underline transition-colors">riguetto.dev</a>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fetchStreams(true)} className={btnBase} title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => setSettingsOpen((v) => !v)} className={btnBase} title="Settings">
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => window.location.href = "/streams/new"} className={btnPrimary} title="New stream">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {settingsOpen && (
        <SettingsPopup
          cardSize={cardSize}
          onCardSize={(s) => { setCardSize(s); localStorage.setItem("cardSize", s) }}
          globalPrefs={globalPrefs}
          onGlobalPrefs={updateGlobalPrefs}
          authEnabled={authEnabled}
          onDownloadPlaylist={downloadPlaylist}
          onLogout={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login" }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <main className="flex-1 p-6">
        {showSkeleton ? (
          <div className="flex flex-wrap gap-4">
            {[...Array(refreshing ? Math.max(streams.length, 1) : 4)].map((_, i) => (
              <SkeletonCard key={i} size={cardSize} />
            ))}
          </div>
        ) : streams.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <p className="text-sm">No streams configured.</p>
            <button onClick={() => window.location.href = "/streams/new"} className={btnPrimary}>
              <Plus className="w-3.5 h-3.5" /> New stream
            </button>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={streams.map((s) => s.id)} strategy={rectSortingStrategy}>
              <div className="flex flex-wrap gap-4">
                {streams.map((s) => (
                  <SortableStreamCard
                    key={s.id}
                    stream={s}
                    status={statuses[s.id]}
                    localStatus={localStatuses[s.id] ?? null}
                    cardSize={cardSize}
                    onRefresh={() => fetchStreams()}
                    onLocalStatus={setLocalStatus}
                    globalPrefs={globalPrefs}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </main>
    </div>
  )
}
