#!/usr/bin/env node
// Types into the focused element of a stream's page through Chrome DevTools Protocol.
//
// Usage: node cdptype.mjs DEBUG_PORT STEP [STEP...]
//   selectall   — select the whole content of the focused field
//   env:NAME    — insert the value of env var NAME (credentials never go through argv)
//   key:Tab | key:Enter | key:Delete
//
// Used by autologin on the gpu display backend. Keyboard injection through the
// compositor is unreliable there (see vnckeys.py); Input.insertText writes the exact
// string — accents and symbols included — and fires the same input events as typing,
// so framework-controlled fields (React, Vue) pick the value up.

const [port, ...steps] = process.argv.slice(2)

const KEYS = {
  Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
  Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
  Delete: { key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 },
}

async function main() {
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  const page = tabs.find((t) => t.type === "page")
  if (!page) throw new Error("no page target")

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  const pending = new Map()
  let nextId = 0
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  }
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId
      pending.set(id, resolve)
      ws.send(JSON.stringify({ id, method, params }))
    })

  for (const step of steps) {
    if (step === "selectall") {
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2, commands: ["selectAll"] })
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 })
    } else if (step.startsWith("env:")) {
      await send("Input.insertText", { text: process.env[step.slice(4)] ?? "" })
    } else if (step.startsWith("key:") && KEYS[step.slice(4)]) {
      const { text, ...k } = KEYS[step.slice(4)]
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...k, nativeVirtualKeyCode: k.windowsVirtualKeyCode })
      // the char event is what triggers implicit form submission on Enter
      if (text) await send("Input.dispatchKeyEvent", { type: "char", ...k, text, unmodifiedText: text })
      await send("Input.dispatchKeyEvent", { type: "keyUp", ...k, nativeVirtualKeyCode: k.windowsVirtualKeyCode })
    } else {
      throw new Error(`unknown step ${step}`)
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  ws.close()
}

const timer = setTimeout(() => { console.error("cdptype: timeout"); process.exit(1) }, 15000)
main()
  .then(() => { clearTimeout(timer); process.exit(0) })
  .catch((err) => { console.error(`cdptype: ${err.message}`); process.exit(1) })
