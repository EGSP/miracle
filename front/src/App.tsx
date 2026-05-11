import { Outlet } from "@tanstack/react-router";
import { Header } from "./components/blocks/Header";
import { NavBar } from "./components/blocks/NavBar";
import { AuthContextProvider } from "./contexts/AuthContext";

export function App() {
    return (
        <AuthContextProvider>
            <div className="flex flex-col w-full h-full">
                <Header />
                <NavBar />
                <Outlet/>
            </div>
        </AuthContextProvider>
    )
}