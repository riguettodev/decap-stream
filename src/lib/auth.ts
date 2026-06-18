// Edge-compatible — no Node.js imports here (used in middleware)

export const AUTH_ENABLED = !!(process.env.AUTH_USER && process.env.AUTH_PASS)
export const COOKIE_NAME = "ds_session"

// Cookie lifetime in seconds. Default 365 days — a NOC TV opens a fixed stream
// URL and never navigates, so nothing triggers a rolling refresh; the cookie
// just has to outlive normal use. Override with SESSION_MAX_AGE_DAYS.
// To force-invalidate every existing cookie, change AUTH_PASS (rotates the token).
export const SESSION_MAX_AGE =
  (Number(process.env.SESSION_MAX_AGE_DAYS) || 365) * 24 * 60 * 60

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
