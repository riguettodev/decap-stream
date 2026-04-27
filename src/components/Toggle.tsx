import { cn } from "@/lib/utils"

export function Toggle({ on }: { on: boolean }) {
  return (
    <span className={cn("w-8 h-4 rounded-full flex items-center px-0.5 transition-colors shrink-0", on ? "bg-blue-500" : "bg-zinc-600")}>
      <span className={cn("w-3 h-3 rounded-full bg-white transition-transform", on ? "translate-x-4" : "translate-x-0")} />
    </span>
  )
}
