// Edge-compatible — no Node.js imports here (used in middleware)

export const AUTH_ENABLED = !!(process.env.AUTH_USER && process.env.AUTH_PASS)
export const COOKIE_NAME = "ds_session"

// Cached promise — token is deterministic (env vars never change at runtime)
let _tokenCache: Promise<string> | null = null

// HMAC-SHA256(user, key=pass) — deterministic, no in-memory state, survives restarts
// Works in both Edge (SubtleCrypto) and Node.js runtime
export function computeSessionToken(): Promise<string> {
  if (_tokenCache) return _tokenCache
  const user = process.env.AUTH_USER ?? ""
  const pass = process.env.AUTH_PASS ?? ""
  const enc = new TextEncoder()
  _tokenCache = globalThis.crypto.subtle
    .importKey("raw", enc.encode(pass), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    .then(key => globalThis.crypto.subtle.sign("HMAC", key, enc.encode(user)))
    .then(sig => Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, "0")).join(""))
  return _tokenCache
}
