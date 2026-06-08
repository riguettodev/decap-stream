"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronRight, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { STREAM_DEFAULTS, type Stream, type StreamCreate, type StreamUpdate } from "@/types/stream"

interface Props { initial?: Stream }

const SLUG_RE = /^[a-z0-9-]+$/
const PRESETS = ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium"]
const TUNES = ["stillimage", "animation", "zerolatency", "film", "fastdecode"]

const TOOLTIPS = {
  id:         "Unique identifier used in URLs, RTMP path (/live/{id}) and HLS path. Lowercase letters, numbers and hyphens only.",
  name:       "Display name shown in the interface. Does not affect the stream.",
  url:        "The URL Chromium will open and capture as a video stream.",
  user:       "Username for auto-login. Chromium will type this into the first form field after the page loads.",
  pass:       "Password for auto-login. Typed after the username field.",
  resolution: "Virtual display (Xvfb) and Chromium window size. This is what ffmpeg captures. Format: WIDTHxHEIGHT.",
  scale:      "Output video resolution. Can be lower than the capture resolution to reduce bandwidth. Format: WIDTHxHEIGHT.",
  fps:        "Frames per second for capture and encoding. Higher values produce smoother video but increase CPU and bandwidth usage.",
  bitrate:    "Target video bitrate. Higher values improve quality at the cost of bandwidth. Examples: 1500k, 3000k.",
  bufsize:    "Encoder buffer size. Controls bitrate variance. Recommended: 2× bitrate.",
  preset:     "Encoding speed vs compression trade-off. Faster presets use less CPU but produce larger files at the same quality. From fastest to slowest: ultrafast → superfast → veryfast → faster → fast → medium.",
  tune:       "Optimizes the encoder for your content type.\n• stillimage — best for static or slow-changing content\n• animation — solid colors, UI, charts\n• zerolatency — minimizes encoding delay\n• film — natural video with grain\n• fastdecode — easier to decode on the client side",
  delay:      "Seconds to wait after Chromium starts before ffmpeg begins capturing. Gives the page time to fully load and render.",
  gop:        "Keyframe interval in frames. Recommended: 2× FPS. Affects HLS segment alignment and seek accuracy. Auto-calculated from FPS unless manually changed.",
  threads:    "Number of ffmpeg encoding threads. 0 = auto-detect (recommended). Increasing this can reduce latency on multi-core systems at the cost of slightly reduced compression efficiency.",
  gpuMode:    "Chromium rendering backend.\n• Disabled — uses --disable-gpu. Lowest CPU. WebGL/maps (Mapbox, MapLibre) won't render.\n• Software WebGL — SwiftShader CPU rasterizer. Makes WebGL/maps work without a GPU, but is CPU-heavy (a 1080p map can saturate several cores) and uses Chromium's --enable-unsafe-swiftshader (lower security; use only for trusted URLs).\n• Hardware GPU — no --disable-gpu; only works if the host exposes a real GPU to the container.",
}

function Tooltip({ text }: { text: string }) {
  return (
    <div className="relative group inline-flex items-center">
      <span className="w-3.5 h-3.5 rounded-full border border-muted-foreground/40 text-muted-foreground/70 text-[10px] flex items-center justify-center cursor-help select-none leading-none flex-shrink-0">?</span>
      <div className="absolute bottom-full left-0 mb-2 z-50 hidden group-hover:block w-56 rounded bg-[#1c1c1c] border border-border px-2.5 py-2 text-xs text-muted-foreground shadow-xl pointer-events-none whitespace-pre-line">
        {text}
      </div>
    </div>
  )
}

function Field({ label, tooltip, required, error, children }: {
  label: string
  tooltip?: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <label className="text-sm font-medium">
          {label}{required && <span className="text-destructive ml-0.5">*</span>}
        </label>
        {tooltip && <Tooltip text={tooltip} />}
      </div>
      {children}
      {error && <p className="text-xs font-bold text-red-500">{error}</p>}
    </div>
  )
}

const inputClass = "w-full rounded border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring transition-colors"
const selectClass = cn(inputClass, "appearance-none bg-muted text-foreground")

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />
}

function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(selectClass, className)} {...props}>
      {children}
    </select>
  )
}

function normalizeScaleDisplay(s: string) { return s.replace(":", "x") }

export function StreamForm({ initial }: Props) {
  const router = useRouter()
  const isEdit = !!initial

  const [form, setForm] = useState<StreamCreate>({
    id: initial?.id ?? "",
    name: initial?.name ?? "",
    url: initial?.url ?? "",
    user: initial?.user ?? "",
    pass: initial?.pass ?? "",
    ...STREAM_DEFAULTS,
    ...(initial ? {
      delay:      initial.delay,
      resolution: initial.resolution,
      scale:      normalizeScaleDisplay(initial.scale),
      fps:        initial.fps,
      bitrate:    initial.bitrate,
      bufsize:    initial.bufsize,
      preset:     initial.preset,
      tune:       initial.tune,
      gop:        initial.gop,
      threads:    initial.threads ?? 0,
      gpu:        initial.gpu ?? false,
      gpuMode:    initial.gpuMode ?? (initial.gpu ? "hardware" : "off"),
    } : {}),
  })

  const [gopManuallyEdited, setGopManuallyEdited] = useState(isEdit)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  function set(key: keyof StreamCreate, value: string | number | boolean) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => { const n = { ...e }; delete n[key as string]; return n })
  }

  function setFps(value: number) {
    set("fps", value)
    if (!gopManuallyEdited) set("gop", value * 2)
  }

  // Keep the deprecated `gpu` boolean in sync with the 3-way mode for rollback/back-compat.
  function setGpuMode(mode: "off" | "software" | "hardware") {
    setForm((f) => ({ ...f, gpuMode: mode, gpu: mode === "hardware" }))
  }

  function setGop(value: number) {
    setGopManuallyEdited(true)
    set("gop", value)
  }

  function setScale(value: string) {
    set("scale", value.replace(":", "x"))
    if (value && !/^\d+[x:]\d+$/.test(value)) {
      setErrors((e) => ({ ...e, scale: "Invalid format. Use 1280x720" }))
    } else {
      setErrors((e) => { const n = { ...e }; delete n.scale; return n })
    }
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!isEdit && (!form.id || !SLUG_RE.test(form.id))) e.id = "Lowercase letters, numbers and hyphens only"
    if (!isEdit && !form.id) e.id = "Required"
    if (!form.name.trim()) e.name = "Required"
    if (!form.url.trim()) e.url = "Required"
    if (!form.resolution.trim()) e.resolution = "Required"
    if (!form.scale.trim() || !/^\d+[x:]\d+$/.test(form.scale)) e.scale = "Invalid format. Use 1280x720"
    if (!form.bitrate.trim()) e.bitrate = "Required"
    if (!form.bufsize.trim()) e.bufsize = "Required"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function submit() {
    if (!validate()) return
    setSaving(true)

    if (isEdit) {
      fetch(`/api/streams/${initial!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form as StreamUpdate),
      })
    } else {
      await fetch("/api/streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
    }

    window.location.href = "/"
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.push("/")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back
        </button>
        <h1 className="text-lg font-semibold">{isEdit ? `Edit — ${initial!.name}` : "New stream"}</h1>
      </header>

      <main className="flex-1 p-6 max-w-2xl mx-auto w-full flex flex-col gap-6">

        {/* Identification */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Identification</h2>
          <Field label="ID" tooltip={TOOLTIPS.id} required error={errors.id}>
            <Input value={form.id} disabled={isEdit} placeholder="my-stream" onChange={(e) => set("id", e.target.value.toLowerCase())} />
          </Field>
          <Field label="Name" tooltip={TOOLTIPS.name} required error={errors.name}>
            <Input value={form.name} placeholder="My Stream" onChange={(e) => set("name", e.target.value)} />
          </Field>
        </section>

        <hr className="border-border" />

        {/* Source */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source</h2>
          <Field label="URL" tooltip={TOOLTIPS.url} required error={errors.url}>
            <Input value={form.url} placeholder="https://..." onChange={(e) => set("url", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Username" tooltip={TOOLTIPS.user}>
              <Input autoComplete="off" value={form.user ?? ""} onChange={(e) => set("user", e.target.value)} />
            </Field>
            <Field label="Password" tooltip={TOOLTIPS.pass}>
              <Input type="password" autoComplete="new-password" value={form.pass ?? ""} onChange={(e) => set("pass", e.target.value)} />
            </Field>
          </div>
        </section>

        <hr className="border-border" />

        {/* Stream */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stream</h2>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Resolution" tooltip={TOOLTIPS.resolution} required error={errors.resolution}>
              <Input value={form.resolution} placeholder="1920x1080" onChange={(e) => set("resolution", e.target.value)} />
            </Field>
            <Field label="Scale" tooltip={TOOLTIPS.scale} required error={errors.scale}>
              <Input value={form.scale} placeholder="1280x720" onChange={(e) => setScale(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="FPS" tooltip={TOOLTIPS.fps} required>
              <Input type="number" min={1} value={form.fps} onChange={(e) => setFps(Number(e.target.value))} />
            </Field>
            <Field label="Bitrate" tooltip={TOOLTIPS.bitrate} required error={errors.bitrate}>
              <Input value={form.bitrate} placeholder="1500k" onChange={(e) => set("bitrate", e.target.value)} />
            </Field>
            <Field label="Bufsize" tooltip={TOOLTIPS.bufsize} required error={errors.bufsize}>
              <Input value={form.bufsize} placeholder="3000k" onChange={(e) => set("bufsize", e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Preset" tooltip={TOOLTIPS.preset} required>
              <Select value={form.preset} onChange={(e) => set("preset", e.target.value)}>
                {PRESETS.map((p) => <option key={p} value={p} style={{ background: "#1a1a1a", color: "#ededed" }}>{p}</option>)}
              </Select>
            </Field>
            <Field label="Tune" tooltip={TOOLTIPS.tune} required>
              <Select value={form.tune} onChange={(e) => set("tune", e.target.value)}>
                {TUNES.map((t) => <option key={t} value={t} style={{ background: "#1a1a1a", color: "#ededed" }}>{t}</option>)}
              </Select>
            </Field>
          </div>

          {/* Advanced */}
          <div className="flex flex-col gap-3 mt-1">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-fit"
            >
              {advancedOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Advanced settings
            </button>

            {advancedOpen && (
              <div className="flex flex-col gap-4 rounded border border-border bg-muted/30 p-4">
                <div className="flex items-start gap-2 text-xs text-yellow-500/80">
                  <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Changing these settings incorrectly may break the stream.</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Boot delay (s)" tooltip={TOOLTIPS.delay}>
                    <Input type="number" min={0} value={form.delay} onChange={(e) => set("delay", Number(e.target.value))} />
                  </Field>
                  <Field label="GOP" tooltip={TOOLTIPS.gop}>
                    <Input type="number" min={1} value={form.gop} onChange={(e) => setGop(Number(e.target.value))} />
                  </Field>
                  <Field label="Threads" tooltip={TOOLTIPS.threads}>
                    <Input type="number" min={0} value={form.threads ?? 0} onChange={(e) => set("threads", Number(e.target.value))} />
                  </Field>
                </div>
                <Field label="Rendering (Chromium)" tooltip={TOOLTIPS.gpuMode}>
                  <Select
                    value={form.gpuMode ?? "off"}
                    onChange={(e) => setGpuMode(e.target.value as "off" | "software" | "hardware")}
                  >
                    <option value="off" style={{ background: "#1a1a1a", color: "#ededed" }}>Disabled — lowest CPU, no WebGL (default)</option>
                    <option value="software" style={{ background: "#1a1a1a", color: "#ededed" }}>Software WebGL (SwiftShader) — maps/WebGL, high CPU</option>
                    <option value="hardware" style={{ background: "#1a1a1a", color: "#ededed" }}>Hardware GPU — requires GPU passthrough</option>
                  </Select>
                </Field>
              </div>
            )}
          </div>
        </section>

        <div className="flex gap-3 pb-8">
          <button onClick={() => router.push("/")} className="px-4 py-2 rounded border border-border text-sm hover:bg-[#2a2a2a] active:bg-[#333] transition-colors cursor-pointer">
            Cancel
          </button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 rounded border border-primary bg-primary text-primary-foreground text-sm hover:bg-[#2a2a2a] hover:text-foreground hover:border-border active:bg-[#333] transition-colors disabled:opacity-50 cursor-pointer">
            {saving ? "Saving..." : isEdit ? "Save changes" : "Create stream"}
          </button>
        </div>
      </main>
    </div>
  )
}
