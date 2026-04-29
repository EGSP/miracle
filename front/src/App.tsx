import { Outlet } from "@tanstack/react-router";
import { Header } from "./components/blocks/Header";
import { AuthContextProvider } from "./contexts/AuthContext";

export function App() {
    return (
        <AuthContextProvider>
            <div className="flex flex-col w-full h-full">
                <Header />
                <Outlet/>
            </div>
        </AuthContextProvider>
    )
}