"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { STREAM_DEFAULTS, type Stream, type StreamCreate, type StreamUpdate } from "@/types/stream"

interface Props {
  initial?: Stream
}

const SLUG_RE = /^[a-z0-9-]+$/

const PRESETS = ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium"]
const TUNES = ["stillimage", "zerolatency", "film", "animation"]

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring transition-colors",
        className
      )}
      {...props}
    />
  )
}

function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring transition-colors",
        className
      )}
      {...props}
    />
  )
}

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
      delay: initial.delay,
      resolution: initial.resolution,
      scale: initial.scale,
      fps: initial.fps,
      bitrate: initial.bitrate,
      bufsize: initial.bufsize,
      preset: initial.preset,
      tune: initial.tune,
      gop: initial.gop,
    } : {}),
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  function set(key: keyof StreamCreate, value: string | number) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => { const n = { ...e }; delete n[key]; return n })
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!isEdit && !SLUG_RE.test(form.id)) e.id = "Apenas letras minúsculas, números e hífen"
    if (!form.name.trim()) e.name = "Obrigatório"
    if (!form.url.trim()) e.url = "Obrigatório"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function submit() {
    if (!validate()) return
    setSaving(true)

    if (isEdit) {
      const body: StreamUpdate = { ...form }
      await fetch(`/api/streams/${initial!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    } else {
      await fetch("/api/streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
    }

    setSaving(false)
    router.push("/")
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.push("/")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Voltar
        </button>
        <h1 className="text-lg font-semibold">{isEdit ? `Editar — ${initial!.name}` : "Nova stream"}</h1>
      </header>

      <main className="flex-1 p-6 max-w-2xl mx-auto w-full flex flex-col gap-8">

        {/* Identificação */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Identificação</h2>
          <Field label="ID (slug)" error={errors.id}>
            <Input
              value={form.id}
              disabled={isEdit}
              placeholder="mapa-zabbix"
              onChange={(e) => set("id", e.target.value.toLowerCase())}
            />
          </Field>
          <Field label="Nome" error={errors.name}>
            <Input value={form.name} placeholder="Mapa Zabbix" onChange={(e) => set("name", e.target.value)} />
          </Field>
        </section>

        {/* Fonte */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Fonte</h2>
          <Field label="URL" error={errors.url}>
            <Input value={form.url} placeholder="https://..." onChange={(e) => set("url", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Usuário (opcional)">
              <Input value={form.user ?? ""} onChange={(e) => set("user", e.target.value)} />
            </Field>
            <Field label="Senha (opcional)">
              <Input type="password" value={form.pass ?? ""} onChange={(e) => set("pass", e.target.value)} />
            </Field>
          </div>
        </section>

        {/* FFmpeg */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">FFmpeg / Xvfb</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Resolução (Xvfb/Chrome)">
              <Input value={form.resolution} placeholder="1920x1080" onChange={(e) => set("resolution", e.target.value)} />
            </Field>
            <Field label="Scale (stream output)">
              <Input value={form.scale} placeholder="1280:720" onChange={(e) => set("scale", e.target.value)} />
            </Field>
            <Field label="FPS">
              <Input type="number" value={form.fps} onChange={(e) => set("fps", Number(e.target.value))} />
            </Field>
            <Field label="Delay (s)">
              <Input type="number" value={form.delay} onChange={(e) => set("delay", Number(e.target.value))} />
            </Field>
            <Field label="Bitrate">
              <Input value={form.bitrate} placeholder="1500k" onChange={(e) => set("bitrate", e.target.value)} />
            </Field>
            <Field label="Bufsize">
              <Input value={form.bufsize} placeholder="1500k" onChange={(e) => set("bufsize", e.target.value)} />
            </Field>
            <Field label="GOP">
              <Input type="number" value={form.gop} onChange={(e) => set("gop", Number(e.target.value))} />
            </Field>
            <Field label="Preset">
              <Select value={form.preset} onChange={(e) => set("preset", e.target.value)}>
                {PRESETS.map((p) => <option key={p}>{p}</option>)}
              </Select>
            </Field>
            <Field label="Tune">
              <Select value={form.tune} onChange={(e) => set("tune", e.target.value)}>
                {TUNES.map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
          </div>
        </section>

        {/* Actions */}
        <div className="flex gap-3 pb-8">
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 rounded border border-border text-sm hover:bg-accent transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar stream"}
          </button>
        </div>
      </main>
    </div>
  )
}
