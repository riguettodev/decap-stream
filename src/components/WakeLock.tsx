"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

export function WakeLock() {
  const pathname = usePathname()

  useEffect(() => {
    if (pathname === "/login") return

    const id = setInterval(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, clientX: Math.random(), clientY: Math.random() }))
    }, 30000)

    return () => clearInterval(id)
  }, [pathname])

  return null
}
