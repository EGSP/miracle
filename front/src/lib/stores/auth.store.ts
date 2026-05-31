import { create } from "zustand"

type AuthStatus = undefined | "valid" | "unauthorized"

export type AuthState = {
  status: AuthStatus
  setStatus: (status: AuthStatus) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  status: undefined,
  setStatus: (status) => set({ status }),
}))
