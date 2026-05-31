import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import { useDialogStore } from "@/lib/stores/dialog.store"

export function DialogProvider({ children }: { children: ReactNode }) {
  const isOpen = useDialogStore((s) => s.isOpen)
  const renderer = useDialogStore((s) => s.renderer)
  const close = useDialogStore((s) => s.close)

  return (
    <>
      {children}
      {isOpen && renderer != null && createPortal(renderer({ close }), document.body)}
    </>
  )
}
