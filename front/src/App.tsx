import { Outlet } from "@tanstack/react-router";
import { Header } from "./components/blocks/Header";

export function App() {
    return (
        <div className="flex flex-col w-full h-full">
            <Header />
            <Outlet/>
        </div>
    )
}