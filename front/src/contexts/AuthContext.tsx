import type { UserRole } from "@miracle/types"
import { createContext, useContext } from "react"
import { useGetCookieSession } from "@/lib/queries/sessions.query"

interface AuthContextType {
  isAuthenticated: boolean
  isSessionPending: boolean
  userId: string | undefined
  role: UserRole | undefined
}
export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthContextProvider({ children }: { children: React.ReactNode }) {
  const { data: session, isPending: isSessionPending } = useGetCookieSession()

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: Boolean(session),
        isSessionPending,
        userId: session?.userId,
        role: session?.role,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("Context not found: AuthContext")
  }
  return context
}
