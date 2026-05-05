import { X, Play, Globe, Monitor, LayoutGrid } from "lucide-react"
import type { ViewerMode, ViewersResponse } from "@/types/stream"
import type { Stream } from "@/types/stream"

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return "< 1m"
}

const modeIcon: Record<ViewerMode, React.ReactNode> = {
  hls: <Play className="w-3 h-3 shrink-0" />,
  html: <Globe className="w-3 h-3 shrink-0" />,
  vnc: <Monitor className="w-3 h-3 shrink-0" />,
  wall: <LayoutGrid className="w-3 h-3 shrink-0" />,
}

const modeLabel: Record<ViewerMode, string> = {
  hls: "HLS",
  html: "HTML",
  vnc: "VNC",
  wall: "Wall",
}

const WALL_KEY = "__wall"

export function ViewersPopup({
  data,
  streams,
  pureMode,
  onClose,
}: {
  data: ViewersResponse | null
  streams: Stream[]
  pureMode: boolean
  onClose: () => void
}) {
  const streamMap = Object.fromEntries(streams.map((s) => [s.id, s.name]))

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div
        className="fixed top-16 right-6 z-50 w-72 rounded-lg border border-border shadow-2xl flex flex-col max-h-[calc(100vh-80px)]"
        style={{ background: "#1c1c1c" }}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Viewers ativos</p>
            {data && data.total > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-medium rounded-full px-1.5 leading-5">
                {data.total}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {data === null ? (
            <p className="text-xs text-muted-foreground px-4 py-6 text-center">Carregando...</p>
          ) : data.total === 0 ? (
            <p className="text-xs text-muted-foreground px-4 py-6 text-center">Nenhum viewer ativo</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {Object.entries(data.streams).map(([streamId, { count, viewers }]) => (
                <div key={streamId} className="px-4 py-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium truncate">{streamId === WALL_KEY ? "TV Wall" : (streamMap[streamId] ?? streamId)}</span>
                    <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 shrink-0 ml-2">
                      {count}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {viewers.map((v, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="shrink-0">{modeIcon[v.mode]}</span>
                        <span className="font-mono text-[11px] flex-1 truncate">{v.ip}</span>
                        <span className="shrink-0 text-[10px] bg-muted rounded px-1 py-0.5">{modeLabel[v.mode]}</span>
                        <span className="shrink-0 text-[10px] tabular-nums">{formatDuration(v.durationMs)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {pureMode && (
          <div className="px-4 py-2.5 border-t border-border shrink-0">
            <p className="text-[10px] text-muted-foreground">
              Pure mode ativo — viewers HLS diretos não são rastreados.
            </p>
          </div>
        )}
      </div>
    </>
  )
}
