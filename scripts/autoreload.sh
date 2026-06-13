#!/bin/bash

SLEEP_PID=""
_cleanup() { [ -n "$SLEEP_PID" ] && kill "$SLEEP_PID" 2>/dev/null; exit 0; }
trap '_cleanup' TERM INT

[ "${AUTO_RELOAD:-false}" = "false" ] && exit 0

sleep "${STREAM_DELAY:-0}"

INTERVAL="${AUTO_RELOAD_INTERVAL:-3600}"

while true; do
  sleep "$INTERVAL" &
  SLEEP_PID=$!
  wait $SLEEP_PID
  SLEEP_PID=""

  # timeout: sem ele, um socket pendurado (Chromium reiniciando, upgrade que
  # nunca responde) deixa o node vivo pra sempre e congela o loop inteiro
  timeout 15 node -e "
const http = require('http');
const net = require('net');
const crypto = require('crypto');

http.get('http://localhost:${DEBUG_PORT}/json', res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    try {
      const tabs = JSON.parse(d);
      const page = tabs.find(t => t.type === 'page');
      if (!page) return;
      const u = new URL(page.webSocketDebuggerUrl);
      const key = crypto.randomBytes(16).toString('base64');
      const s = net.createConnection({ host: u.hostname, port: +u.port || 80 });
      s.on('connect', () => {
        s.write(
          'GET ' + u.pathname + ' HTTP/1.1\r\n' +
          'Host: ' + u.host + '\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          'Sec-WebSocket-Key: ' + key + '\r\n' +
          'Sec-WebSocket-Version: 13\r\n\r\n'
        );
      });
      let upgraded = false, buf = Buffer.alloc(0);
      s.on('data', chunk => {
        if (upgraded) return;
        buf = Buffer.concat([buf, chunk]);
        if (buf.indexOf('\r\n\r\n') === -1) return;
        upgraded = true;
        const msg = Buffer.from(JSON.stringify({ id: 1, method: 'Page.reload', params: {} }));
        const mask = crypto.randomBytes(4);
        const frame = Buffer.alloc(6 + msg.length);
        frame[0] = 0x81;
        frame[1] = 0x80 | msg.length;
        mask.copy(frame, 2);
        for (let i = 0; i < msg.length; i++) frame[6 + i] = msg[i] ^ mask[i % 4];
        s.write(frame);
        setTimeout(() => s.destroy(), 500);
      });
      s.on('error', () => {});
    } catch (_) {}
  });
}).on('error', () => {});
" 2>/dev/null || true
done
