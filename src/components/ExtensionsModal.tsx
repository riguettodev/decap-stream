"use client"

import { useEffect, useRef, useState } from "react"
import { X, Upload, Trash2, AlertTriangle, Loader2, Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  streamId: string
  streamName: string
  onClose: () => void
}

interface ExtensionsState {
  unpacked: string[]
  forcelist: string[]
}

const FORCELIST_RE = /^[a-p]{32}$/

export function ExtensionsModal({ streamId, streamName, onClose }: Props) {
  const [tab, setTab] = useState<"forcelist" | "upload">("forcelist")
  const [state, setState] = useState<ExtensionsState>({ unpacked: [], forcelist: [] })
  const [forcelistText, setForcelistText] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [diag, setDiag] = useState<Record<string, unknown> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await fetch(`/api/streams/${streamId}/extensions`)
      const data = await r.json()
      setState({ unpacked: data.unpacked ?? [], forcelist: data.forcelist ?? [] })
      setForcelistText((data.forcelist ?? []).join("\n"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [streamId]) // eslint-disable-line

  function parseForcelistInput(): string[] {
    const ids = forcelistText
      .split(/\s+|,/)
      .map((s) => {
        const m = s.match(/[a-p]{32}/)
        return m ? m[0] : ""
      })
      .filter((s) => FORCELIST_RE.test(s))
    return Array.from(new Set(ids))
  }

  async function saveForcelist() {
    setBusy("forcelist")
    setError(null)
    try {
      const ids = parseForcelistInput()
      const r = await fetch(`/api/streams/${streamId}/extensions/forcelist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? "save failed")
      const data = await r.json()
      setState((s) => ({ ...s, forcelist: data.forcelist }))
      setForcelistText((data.forcelist as string[]).join("\n"))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function deleteForcelist(extId: string) {
    setBusy(`forcelist:${extId}`)
    try {
      const r = await fetch(`/api/streams/${streamId}/extensions/forcelist/${extId}`, { method: "DELETE" })
      const data = await r.json()
      setState((s) => ({ ...s, forcelist: data.forcelist }))
      setForcelistText((data.forcelist as string[]).join("\n"))
    } finally {
      setBusy(null)
    }
  }

  async function uploadFile(file: File) {
    setBusy("upload")
    setError(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const r = await fetch(`/api/streams/${streamId}/extensions/upload`, { method: "POST", body: fd })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? "upload failed")
      setState((s) => ({ ...s, unpacked: data.unpacked }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function deleteUnpacked(slug: string) {
    setBusy(`unpacked:${slug}`)
    try {
      const r = await fetch(`/api/streams/${streamId}/extensions/unpacked/${slug}`, { method: "DELETE" })
      const data = await r.json()
      setState((s) => ({ ...s, unpacked: data.unpacked }))
    } finally {
      setBusy(null)
    }
  }

  async function applyAndRestart() {
    setBusy("apply")
    setError(null)
    setApplied(false)
    setDiag(null)
    try {
      const r = await fetch(`/api/streams/${streamId}/extensions/apply`, { method: "POST" })
      const data = await r.json()
      if (data.diag) setDiag(data.diag)
      if (!r.ok || data.ok === false) throw new Error(data.error ?? data.diag?.applyError ?? "apply failed")
      setApplied(true)
      setTimeout(() => setApplied(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const tabBtn = (active: boolean) =>
    cn(
      "px-4 py-2 text-sm border-b-2 transition-colors cursor-pointer",
      active ? "border-blue-500 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
    )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative z-10 w-[560px] max-w-[95vw] max-h-[85vh] flex flex-col rounded-xl border border-border shadow-2xl"
        style={{ background: "#1c1c1c" }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold">Extensions</h2>
            <p className="text-xs text-muted-foreground truncate max-w-[400px]">{streamName}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#2a2a2a] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-border">
          <button onClick={() => setTab("forcelist")} className={tabBtn(tab === "forcelist")}>Web Store IDs</button>
          <button onClick={() => setTab("upload")} className={tabBtn(tab === "upload")}>Upload</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...
            </div>
          ) : tab === "forcelist" ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                Paste Chrome Web Store extension IDs or URLs (one per line). IDs are 32 chars [a-p].
                The Chromium will fetch and install them automatically.
              </p>
              <textarea
                value={forcelistText}
                onChange={(e) => setForcelistText(e.target.value)}
                placeholder="cjpalhdlnbpafiamejdnhcphjbkeiagm&#10;https://chromewebstore.google.com/detail/.../{id}"
                rows={5}
                className="w-full text-xs font-mono bg-[#0f0f0f] border border-border rounded p-2 resize-none"
              />
              <div className="flex justify-end">
                <button
                  onClick={saveForcelist}
                  disabled={busy === "forcelist"}
                  className="px-3 py-1.5 rounded border border-border text-xs hover:bg-[#2a2a2a] cursor-pointer disabled:opacity-50"
                >
                  {busy === "forcelist" ? "Saving..." : "Save IDs"}
                </button>
              </div>

              <div className="border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-2">Current ({state.forcelist.length})</p>
                {state.forcelist.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No Web Store extensions configured.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {state.forcelist.map((id) => (
                      <li key={id} className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-[#0f0f0f] text-xs font-mono">
                        <span className="truncate">{id}</span>
                        <button
                          onClick={() => deleteForcelist(id)}
                          disabled={busy === `forcelist:${id}`}
                          className="p-1 hover:bg-[#2a2a2a] rounded text-destructive cursor-pointer disabled:opacity-50"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2 p-2.5 rounded border border-yellow-700/50 bg-yellow-900/20 text-xs text-yellow-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Unpacked extensions run arbitrary code. Only upload ZIPs you trust.</span>
              </div>

              <input
                ref={fileRef}
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) uploadFile(f)
                }}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy === "upload"}
                className="flex items-center justify-center gap-2 px-4 py-6 rounded border border-dashed border-border hover:bg-[#2a2a2a] cursor-pointer disabled:opacity-50 text-sm"
              >
                {busy === "upload" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {busy === "upload" ? "Uploading..." : "Choose ZIP file"}
              </button>
              <p className="text-[11px] text-muted-foreground">ZIP must contain manifest.json at root. Limits: 50MB / 1000 files / 200MB extracted.</p>

              <div className="border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-2">Installed ({state.unpacked.length})</p>
                {state.unpacked.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No unpacked extensions installed.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {state.unpacked.map((slug) => (
                      <li key={slug} className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-[#0f0f0f] text-xs">
                        <span className="truncate font-mono">{slug}</span>
                        <button
                          onClick={() => deleteUnpacked(slug)}
                          disabled={busy === `unpacked:${slug}`}
                          className="p-1 hover:bg-[#2a2a2a] rounded text-destructive cursor-pointer disabled:opacity-50"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded px-2 py-1.5">{error}</div>
          )}

          {diag && (
            <details className="text-[11px] text-muted-foreground bg-[#0f0f0f] border border-border rounded px-2 py-1.5">
              <summary className="cursor-pointer select-none">Apply diagnostics (click to expand)</summary>
              <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[10px] text-muted-foreground/90">
{JSON.stringify(diag, null, 2)}
              </pre>
            </details>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            Apply restarts only the Chromium (~5s black frame in ffmpeg).
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-border text-xs hover:bg-[#2a2a2a] cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={applyAndRestart}
              disabled={busy === "apply"}
              className="px-3 py-1.5 rounded border border-blue-600 bg-blue-600/20 text-blue-300 text-xs hover:bg-blue-600 hover:text-white transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              {busy === "apply" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : applied ? <Check className="w-3.5 h-3.5" /> : null}
              {busy === "apply" ? "Applying..." : applied ? "Applied" : "Apply & Restart"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
