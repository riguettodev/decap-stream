"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Plus, Download, RefreshCw, Settings, X, LogOut, Tv } from "lucide-react"
import { cn } from "@/lib/utils"
import { StreamCard } from "@/components/StreamCard"
import { Toggle } from "@/components/Toggle"
import { TvLayoutGrid } from "@/components/TvLayoutGrid"
import type { TvClickAction } from "@/components/TvLayoutGrid"
import type { Stream } from "@/types/stream"
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

type CardSize = "mini" | "sm" | "md" | "lg"
type GlobalPrefs = {
  pureMode: boolean
  newTab: boolean
  autoReload: boolean
  reloadInterval: number
  tvRows: number
  tvCols: number
  tvClickAction: TvClickAction
}

const DEFAULT_GLOBAL_PREFS: GlobalPrefs = {
  pureMode: false,
  newTab: false,
  autoReload: false,
  reloadInterval: 2,
  tvRows: 3,
  tvCols: 4,
  tvClickAction: "hls",
}

const CARD_WIDTHS: Record<CardSize, string> = { mini: "sm:max-w-[200px]", sm: "sm:max-w-[240px]", md: "sm:max-w-[300px]", lg: "sm:max-w-[380px]" }

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
  const widths = { mini: "sm:max-w-[200px]", sm: "sm:max-w-[240px]", md: "sm:max-w-[300px]", lg: "sm:max-w-[380px]" }
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

function SettingsPopup({ cardSize, onCardSize, globalPrefs, onGlobalPrefs, tvLayoutActive, onTvLayoutActive, authEnabled, onDownloadPlaylist, onLogout, onClose }: {
  cardSize: CardSize
  onCardSize: (s: CardSize) => void
  globalPrefs: GlobalPrefs
  onGlobalPrefs: (patch: Partial<GlobalPrefs>) => void
  tvLayoutActive: boolean
  onTvLayoutActive: (v: boolean) => void
  authEnabled: boolean
  onDownloadPlaylist: () => void
  onLogout: () => void
  onClose: () => void
}) {
  const toggleRow = "flex items-center gap-2 w-full px-1 py-1.5 rounded hover:bg-[#2a2a2a] transition-colors cursor-pointer text-sm"

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed top-16 right-6 z-50 w-64 rounded-lg border border-border shadow-2xl p-4 flex flex-col gap-4 max-h-[calc(100vh-80px)] overflow-y-auto" style={{ background: "#1c1c1c" }}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Settings</p>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#2a2a2a] cursor-pointer transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!tvLayoutActive && (
          <div className="hidden sm:flex flex-col gap-2">
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
        )}

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

        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground tracking-wider uppercase">TV Layout</p>
          <button onClick={() => onTvLayoutActive(!tvLayoutActive)} className={toggleRow}>
            <Toggle on={tvLayoutActive} />
            <span>TV Layout</span>
          </button>
          {tvLayoutActive && (
            <div className="flex flex-col gap-3 pt-1">
              <div className="flex items-center gap-2 px-1 py-1">
                <span className="text-xs text-muted-foreground">Grid</span>
                <input
                  type="number" min={1} max={10}
                  value={globalPrefs.tvRows}
                  onChange={(e) => onGlobalPrefs({ tvRows: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })}
                  className="w-16 px-2 py-1 text-xs rounded border border-border bg-muted text-center"
                />
                <span className="text-xs text-muted-foreground">×</span>
                <input
                  type="number" min={1} max={10}
                  value={globalPrefs.tvCols}
                  onChange={(e) => onGlobalPrefs({ tvCols: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })}
                  className="w-16 px-2 py-1 text-xs rounded border border-border bg-muted text-center"
                />
                <span className="text-xs text-muted-foreground">= {globalPrefs.tvRows * globalPrefs.tvCols}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground px-1">Clicking a stream opens</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { value: "hls", label: "Player", desc: "HLS stream" },
                    { value: "html", label: "HTML", desc: "Embedded page" },
                    { value: "vnc", label: "VNC", desc: "Remote screen" },
                  ] as const).map(({ value, label, desc }) => (
                    <button
                      key={value}
                      onClick={() => onGlobalPrefs({ tvClickAction: value })}
                      className="flex flex-col items-center gap-0.5 px-2 py-2 rounded border text-xs transition-colors cursor-pointer"
                      style={globalPrefs.tvClickAction === value
                        ? { background: "#ededed", color: "#0a0a0a", borderColor: "#ededed" }
                        : {}}
                    >
                      <span className="font-medium">{label}</span>
                      <span className={`text-[10px] ${globalPrefs.tvClickAction === value ? "text-[#777]" : "text-muted-foreground"}`}>{desc}</span>
                    </button>
                  ))}
                </div>
              </div>
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
  const [spinningFab, setSpinningFab] = useState(false)
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [cardSize, setCardSize] = useState<CardSize>("md")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [authEnabled, setAuthEnabled] = useState(false)
  const [globalPrefs, setGlobalPrefs] = useState<GlobalPrefs>(DEFAULT_GLOBAL_PREFS)
  const [tvLayoutActive, setTvLayoutActive] = useState(false)

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
      const savedTv = localStorage.getItem("tv-layout")
      if (savedTv !== null) setTvLayoutActive(savedTv === "true")
      const savedPrefs = localStorage.getItem("global-prefs")
      const parsed: Partial<GlobalPrefs> = savedPrefs ? JSON.parse(savedPrefs) : {}
      if (savedPrefs) setGlobalPrefs({ ...DEFAULT_GLOBAL_PREFS, ...parsed })
      // Fetch config if: no prefs yet (first visit), OR TV prefs are missing (new fields for existing users)
      if (!savedPrefs || !("tvRows" in parsed)) {
        fetch("/api/config").then(r => r.json()).then((cfg: Partial<GlobalPrefs> & { tvLayout?: boolean }) => {
          if (savedTv === null && typeof cfg.tvLayout === "boolean") {
            setTvLayoutActive(cfg.tvLayout)
            localStorage.setItem("tv-layout", String(cfg.tvLayout))
          }
          setGlobalPrefs(prev => {
            const next = savedPrefs
              ? { ...prev, tvRows: cfg.tvRows ?? prev.tvRows, tvCols: cfg.tvCols ?? prev.tvCols, tvClickAction: cfg.tvClickAction ?? prev.tvClickAction }
              : { ...prev, ...cfg }
            try { localStorage.setItem("global-prefs", JSON.stringify(next)) } catch {}
            return next
          })
        }).catch(() => {})
      }
    } catch {}
  }, [])

  function updateGlobalPrefs(patch: Partial<GlobalPrefs>) {
    setGlobalPrefs(prev => {
      const next = { ...prev, ...patch }
      localStorage.setItem("global-prefs", JSON.stringify(next))
      return next
    })
  }

  function updateTvLayoutActive(v: boolean) {
    setTvLayoutActive(v)
    localStorage.setItem("tv-layout", String(v))
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

  async function handleFabRefresh() {
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current)
    setSpinningFab(true)
    const t0 = Date.now()
    await fetchStreams(true)
    const remaining = Math.max(0, 1000 - (Date.now() - t0))
    spinTimerRef.current = setTimeout(() => setSpinningFab(false), remaining)
  }

  function downloadPlaylist() {
    window.location.href = `/api/streams/playlist?host=${window.location.hostname}&port=8888`
  }

  const showSkeleton = loading || refreshing

  const btnBase = "flex items-center gap-1.5 text-sm px-3 py-1.5 h-8 rounded border border-border hover:bg-[#2a2a2a] active:bg-[#333] transition-colors cursor-pointer"
  const btnPrimary = "flex items-center gap-1.5 text-sm px-3 py-1.5 h-8 rounded border border-primary bg-primary text-primary-foreground hover:bg-[#2a2a2a] hover:text-foreground hover:border-border active:bg-[#333] transition-colors cursor-pointer"

  return (
    <div className={cn("flex flex-col", tvLayoutActive ? "h-screen overflow-hidden" : "min-h-screen")}>
      <header className="border-b border-border px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <img src="/web-app-manifest-192x192.png" alt="Decap Stream" className="w-6 h-6 rounded shrink-0" />
          <h1 className="text-lg font-semibold tracking-tight whitespace-nowrap">Decap Stream</h1>
          <span className="text-muted-foreground/40 text-sm select-none whitespace-nowrap">·</span>
          <a href="https://riguetto.dev" target="_blank" rel="noopener noreferrer" className="text-xs text-[#888] hover:text-[#ededed] hover:underline transition-colors whitespace-nowrap">riguetto.dev</a>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!tvLayoutActive && (
            <button onClick={handleFabRefresh} className={cn(btnBase, "hidden sm:flex")} title="Refresh">
              <RefreshCw className={`w-3.5 h-3.5 ${spinningFab ? "animate-spin" : ""}`} />
            </button>
          )}
          <button
            onClick={() => updateTvLayoutActive(!tvLayoutActive)}
            className={cn(btnBase, tvLayoutActive && "border-primary text-primary")}
            title="TV Layout"
          >
            <Tv className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setSettingsOpen((v) => !v)} className={btnBase} title="Settings">
            <Settings className="w-3.5 h-3.5" />
          </button>
          {!tvLayoutActive && (
            <button onClick={() => window.location.href = "/streams/new"} className={cn(btnPrimary, "hidden sm:flex")} title="New stream">
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      {settingsOpen && (
        <SettingsPopup
          cardSize={cardSize}
          onCardSize={(s) => { setCardSize(s); localStorage.setItem("cardSize", s) }}
          globalPrefs={globalPrefs}
          onGlobalPrefs={updateGlobalPrefs}
          tvLayoutActive={tvLayoutActive}
          onTvLayoutActive={updateTvLayoutActive}
          authEnabled={authEnabled}
          onDownloadPlaylist={downloadPlaylist}
          onLogout={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login" }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {tvLayoutActive ? (
        <main className="flex-1 min-h-0 overflow-hidden">
          <TvLayoutGrid
            streams={streams}
            rows={globalPrefs.tvRows}
            cols={globalPrefs.tvCols}
            clickAction={globalPrefs.tvClickAction}
            pureMode={globalPrefs.pureMode}
            newTab={globalPrefs.newTab}
            onPositionsSaved={fetchStreams}
          />
        </main>
      ) : (
        <main className="flex-1 px-3 pt-3 pb-40 sm:p-6">
          {showSkeleton ? (
            <div className="flex flex-wrap gap-3 sm:gap-4 justify-center sm:justify-start">
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
                <div className="flex flex-wrap gap-3 sm:gap-4 justify-center sm:justify-start">
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
      )}

      {!tvLayoutActive && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-3 sm:hidden">
          <button
            onClick={handleFabRefresh}
            className="w-12 h-12 rounded-full border border-[#333] bg-[#1c1c1c] shadow-lg flex items-center justify-center active:bg-[#333] transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${spinningFab ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => window.location.href = "/streams/new"}
            className="w-14 h-14 rounded-full border border-[#333] bg-[#1c1c1c] shadow-lg flex items-center justify-center active:bg-[#333] transition-colors"
            title="New stream"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  )
}
