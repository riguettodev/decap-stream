"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useRouter } from "next/navigation"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams.get("from") ?? "/"

  const [user, setUser] = useState("")
  const [pass, setPass] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, pass }),
    })

    setLoading(false)

    if (res.ok) {
      router.push(from)
      router.refresh()
    } else {
      setError("Invalid credentials")
      setPass("")
    }
  }

  const inputClass = "w-full rounded border border-[#222] bg-[#1a1a1a] px-3 py-2 text-sm text-[#ededed] outline-none focus:ring-1 focus:ring-[#444] transition-colors placeholder:text-[#555]"

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
      <div className="w-80 rounded-xl border border-[#222] shadow-2xl p-6 flex flex-col gap-5" style={{ background: "#111" }}>

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-1">
            <img src="/web-app-manifest-192x192.png" alt="" className="w-5 h-5 rounded" />
            <span className="font-semibold text-sm text-[#ededed]">Decap Stream</span>
          </div>
          <p className="text-xs text-[#888]">Sign in to continue</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            className={inputClass}
            type="text"
            placeholder="Username"
            autoComplete="username"
            autoFocus
            value={user}
            onChange={e => setUser(e.target.value)}
          />
          <input
            className={inputClass}
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={pass}
            onChange={e => setPass(e.target.value)}
          />

          {error && (
            <p className="text-xs text-red-500 font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !user || !pass}
            className="w-full rounded border border-[#ededed] bg-[#ededed] text-[#0a0a0a] text-sm font-medium py-2 hover:bg-transparent hover:text-[#ededed] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer mt-1"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ background: "#0a0a0a" }} className="min-h-screen" />}>
      <LoginForm />
    </Suspense>
  )
}
