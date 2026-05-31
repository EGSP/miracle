import type { ReactNode } from "react"
import { create } from "zustand"

export interface DialogRenderContext {
  close: () => void
}

export type DialogRenderer = (ctx: DialogRenderContext) => ReactNode

interface DialogState {
  isOpen: boolean
  renderer: DialogRenderer | null
  open: (renderer: DialogRenderer) => void
  close: () => void
}

export const useDialogStore = create<DialogState>((set, get) => ({
  isOpen: false,
  renderer: null,
  open: (renderer) => {
    if (get().isOpen) return
    set({ isOpen: true, renderer })
  },
  close: () => set({ isOpen: false, renderer: null }),
}))
