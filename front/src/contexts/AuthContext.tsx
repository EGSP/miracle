import { useGetCookieSession } from "@/lib/queries/sessions.query";
import { useAuthStore } from "@/lib/stores/auth.store";
import type { UserRole } from "@miracle/types";
import { createContext, useContext, useEffect, useState } from "react";

interface AuthContextType {
    isAuthenticated: boolean;
    userId: string | undefined;
    role: UserRole | undefined;
    activate(userId: string, role: UserRole): void;
    deactivate(): void;
}
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthContextProvider({ children }: { children: React.ReactNode }) {

    const authStore = useAuthStore();
    const { data: session, error } = useGetCookieSession();

    const [userId, setUserId] = useState<string | undefined>(undefined);
    const [role, setRole] = useState<UserRole | undefined>(undefined);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        if (session) {
            activate(session.userId, session.role);
        } else {
            deactivate();
        }
    }, [session, error]);

    const activate = (userId: string, role: UserRole) => {
        setIsAuthenticated(true);
        setUserId(userId);
        setRole(role);
    }

    const deactivate = () => {
        authStore.setStatus(undefined);
        setIsAuthenticated(false);
        setUserId(undefined);
        setRole(undefined);
    }

    return (
        <AuthContext.Provider value={
            {
                isAuthenticated,
                userId,
                role,
                activate,
                deactivate,
            }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuthContext() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('Context not found: AuthContext');
    }
    return context;
}