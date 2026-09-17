#!/usr/bin/env python3
"""Send key presses to a stream through its VNC server.

Usage: vnckeys.py PORT COMBO [COMBO...]
  COMBO: "ctrl+KP_Add", "ctrl+0", "Tab", or a single character.

Used on the gpu display backend for Chromium keyboard shortcuts (page zoom). The
obvious tool, wtype, builds its own keymap with arbitrary keycodes: characters come
out right, but Chromium matches shortcuts by physical key code, so Ctrl+Plus arrives
as Ctrl+<Escape> and does nothing. wayvnc maps keysyms through the real XKB keymap,
so the key codes are the ones a physical keyboard would send.

Not for typing arbitrary text: characters missing from the US keymap (é, and some
shifted symbols) get dropped. autologin types through CDP Input.insertText instead.
"""
import socket
import struct
import sys
import time

KEYSYMS = {
    "ctrl": 0xFFE3, "shift": 0xFFE1, "alt": 0xFFE9,
    "Tab": 0xFF09, "Return": 0xFF0D, "Escape": 0xFF1B, "Delete": 0xFFFF, "BackSpace": 0xFF08,
    "KP_Add": 0xFFAB, "KP_Subtract": 0xFFAD, "minus": 0x2D, "equal": 0x3D, "plus": 0x2B,
}


def keysym(name):
    if name in KEYSYMS:
        return KEYSYMS[name]
    if len(name) == 1:
        return ord(name)
    raise SystemExit(f"vnckeys: unknown key {name!r}")


def recv_exact(sock, n):
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise SystemExit("vnckeys: connection closed during handshake")
        buf += chunk
    return buf


def main():
    port = int(sys.argv[1])
    combos = sys.argv[2:]
    sock = socket.create_connection(("127.0.0.1", port), timeout=10)

    # RFB 3.8 handshake, security type None, shared session
    recv_exact(sock, 12)
    sock.sendall(b"RFB 003.008\n")
    types = recv_exact(sock, recv_exact(sock, 1)[0])
    if 1 not in types:
        raise SystemExit(f"vnckeys: server does not offer security type None ({list(types)})")
    sock.sendall(b"\x01")
    if struct.unpack(">I", recv_exact(sock, 4))[0] != 0:
        raise SystemExit("vnckeys: security handshake failed")
    sock.sendall(b"\x01")
    server_init = recv_exact(sock, 24)
    recv_exact(sock, struct.unpack(">I", server_init[20:24])[0])

    def key(sym, down):
        sock.sendall(struct.pack(">BBxxI", 4, 1 if down else 0, sym))

    # warm-up: the first key right after connecting can reach the client before the
    # virtual keyboard's keymap does, and gets lost
    key(KEYSYMS["shift"], True)
    key(KEYSYMS["shift"], False)
    time.sleep(0.3)

    for combo in combos:
        syms = [keysym(part) for part in combo.split("+")] if combo != "+" else [ord("+")]
        for sym in syms:
            key(sym, True)
        for sym in reversed(syms):
            key(sym, False)
        time.sleep(0.1)

    time.sleep(0.2)
    sock.close()


if __name__ == "__main__":
    main()
