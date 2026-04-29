import { useGetCookieSession } from "@/lib/queries/sessions.query";
import { useAuthStore } from "@/lib/stores/auth.store";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";

interface AuthContextType {
    isAuthenticated: boolean;
    userId: string | undefined;
    activate(userId: string): void;
    deactivate(): void;
}
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthContextProvider({ children }: { children: React.ReactNode }) {

    const authStore = useAuthStore();
    const { data: session, error } = useGetCookieSession();

    const [userId, setUserId] = useState<string | undefined>(undefined);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        if (session) {
            activate(session.userId);
        } else {
            deactivate();
        }
    }, [session, error]);

    const activate = (userId: string) => {
        setIsAuthenticated(true);
        setUserId(userId);
    }

    const deactivate = () => {
        authStore.setStatus('unauthorized');
        setIsAuthenticated(false);
        setUserId(undefined);
    }

    return (
        <AuthContext.Provider value={
            {
                isAuthenticated,
                userId,
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