#!/bin/bash

[ -z "${LOGIN_USER:-}" ] && exit 0

CHECK_INTERVAL="${LOGIN_CHECK_INTERVAL:-60}"
MAX_RETRIES="${LOGIN_MAX_RETRIES:-5}"
SLEEP_PID=""
trap '[ -n "$SLEEP_PID" ] && kill "$SLEEP_PID" 2>/dev/null; exit 0' TERM INT

get_current_url() {
  # timeout: um http.get pendurado congelaria o loop de monitoramento inteiro
  timeout 10 node -e "
const http = require('http');
http.get('http://localhost:${DEBUG_PORT}/json', res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    try {
      const tabs = JSON.parse(d);
      const page = tabs.find(t => t.type === 'page');
      process.stdout.write(page ? page.url : '');
    } catch { process.stdout.write(''); }
  });
}).on('error', () => process.stdout.write(''));
" 2>/dev/null
}

is_login_url() {
  echo "$1" | grep -qiE '/(login|signin|sign-in|auth|sso|oauth)'
}

# Runtime.evaluate via WebSocket raw (sem módulo ws): procura input[type=password]
# visível; se achar, foca o campo de username mais próximo (input text/email/tel
# anterior no mesmo form) ou o próprio password. Imprime:
#   "user" — login form achado, username focado (digitar user+tab+pass)
#   "pass" — só password visível, password focado (digitar só pass)
#   "none" — nenhum form de login no DOM
#   ""     — CDP/eval falhou
detect_and_focus() {
  timeout 15 node -e "
const http = require('http');
const net = require('net');
const crypto = require('crypto');

const EXPR = \`(() => {
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const pw = [...document.querySelectorAll('input[type=password]')].find(vis);
  if (!pw) return 'none';
  const scope = pw.form || document;
  const inputs = [...scope.querySelectorAll('input')];
  const i = inputs.indexOf(pw);
  const user = inputs.slice(0, i).reverse().find(el => ['text','email','tel'].includes(el.type) && vis(el));
  if (user) { user.focus(); user.value = ''; return 'user'; }
  pw.focus(); pw.value = '';
  return 'pass';
})()\`;

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
      setTimeout(() => s.destroy(), 5000);
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
      const send = obj => {
        const msg = Buffer.from(JSON.stringify(obj));
        const mask = crypto.randomBytes(4);
        let header;
        if (msg.length < 126) {
          header = Buffer.alloc(2);
          header[1] = 0x80 | msg.length;
        } else {
          header = Buffer.alloc(4);
          header[1] = 0x80 | 126;
          header.writeUInt16BE(msg.length, 2);
        }
        header[0] = 0x81;
        const masked = Buffer.alloc(msg.length);
        for (let i = 0; i < msg.length; i++) masked[i] = msg[i] ^ mask[i % 4];
        s.write(Buffer.concat([header, mask, masked]));
      };
      s.on('data', chunk => {
        buf = Buffer.concat([buf, chunk]);
        if (!upgraded) {
          const end = buf.indexOf('\r\n\r\n');
          if (end === -1) return;
          upgraded = true;
          buf = buf.slice(end + 4);
          send({ id: 1, method: 'Runtime.evaluate', params: { expression: EXPR, returnByValue: true } });
        }
        // parse frames do servidor (sem mask)
        while (buf.length >= 2) {
          let len = buf[1] & 0x7f, off = 2;
          if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
          else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
          if (buf.length < off + len) return;
          const payload = buf.slice(off, off + len);
          buf = buf.slice(off + len);
          try {
            const m = JSON.parse(payload.toString());
            if (m.id === 1) {
              process.stdout.write(String(m.result?.result?.value ?? ''));
              s.destroy();
              return;
            }
          } catch {}
        }
      });
      s.on('error', () => {});
    } catch {}
  });
}).on('error', () => {});
" 2>/dev/null
}

type_credentials() {
  local mode=$1
  DISPLAY=${DISPLAY} xdotool search --sync --onlyvisible --class chromium windowfocus windowraise
  sleep 1
  if [ "$mode" != "pass" ]; then
    DISPLAY=${DISPLAY} xdotool type --clearmodifiers --delay 50 "${LOGIN_USER}"
    DISPLAY=${DISPLAY} xdotool key Tab
    sleep 0.3
  fi
  DISPLAY=${DISPLAY} xdotool type --clearmodifiers --delay 50 "${LOGIN_PASS}"
  DISPLAY=${DISPLAY} xdotool key Return
}

interruptible_sleep() {
  sleep "$1" &
  SLEEP_PID=$!
  wait "$SLEEP_PID"
  SLEEP_PID=""
}

interruptible_sleep "${STREAM_DELAY:-0}"

RETRIES=0

while true; do
  CURRENT_URL=$(get_current_url)
  # URL vazia = CDP indisponível (Chromium subindo/reiniciando) — pular ciclo
  if [ -n "$CURRENT_URL" ]; then
    FOCUS=$(detect_and_focus)
    NEED_LOGIN=false
    MODE="user"
    if [ "$FOCUS" = "user" ] || [ "$FOCUS" = "pass" ]; then
      NEED_LOGIN=true
      MODE=$FOCUS
    elif [ -z "$FOCUS" ] && is_login_url "$CURRENT_URL"; then
      # eval falhou mas a URL é de login — fallback: digitar contando com autofocus
      NEED_LOGIN=true
    fi

    if [ "$NEED_LOGIN" = "true" ]; then
      if [ "$MAX_RETRIES" -gt 0 ] && [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
        echo "[autologin] giving up after ${RETRIES} failed attempts (LOGIN_MAX_RETRIES=${MAX_RETRIES}) — restart the stream to retry"
        exit 0
      fi
      RETRIES=$((RETRIES + 1))
      echo "[autologin] login form detected ($CURRENT_URL, mode=$MODE, attempt $RETRIES) — typing credentials"
      type_credentials "$MODE"
      # dá tempo do login completar (redirects, carregamento) antes de re-checar
      interruptible_sleep 30
    elif [ "$FOCUS" = "none" ]; then
      RETRIES=0
    fi
  fi
  interruptible_sleep "$CHECK_INTERVAL"
done
