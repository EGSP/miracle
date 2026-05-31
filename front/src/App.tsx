import { Outlet } from "@tanstack/react-router"
import { Header } from "./components/blocks/Header"
import { NavBar } from "./components/blocks/NavBar"
import { AuthContextProvider } from "./contexts/AuthContext"
import { DialogProvider } from "./contexts/DialogContext"

export function App() {
  return (
    <DialogProvider>
      <AuthContextProvider>
        <div className="flex flex-col w-full h-full">
          <Header />
          <NavBar />
          <Outlet />
        </div>
      </AuthContextProvider>
    </DialogProvider>
  )
}
