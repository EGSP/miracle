import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthContext } from "@/contexts/AuthContext";
import { useLogin, useLogout, useRegister } from "@/lib/queries/auth.query";
import { useAuthStore } from "@/lib/stores/auth.store";
import { Link, Outlet } from "@tanstack/react-router";
import { useState } from "react"

export function AuthPage() {

    const authStore = useAuthStore();
    const { mutate: logout, isPending: isLogoutPending } = useLogout();

    const { isAuthenticated } = useAuthContext();
    
    if(isAuthenticated) {
        return (
            <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-6 py-8">
                <section className="w-full space-y-3">
                    <h1>Вы авторизованы</h1>
                    <p>Сессия активна. Можно перейти к рабочим разделам приложения.</p>
                    <Link to="/">На главную</Link>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => logout()}
                        disabled={isLogoutPending}
                    >
                        {isLogoutPending ? "Выйти из аккаунта..." : "Выйти из аккаунта"}
                    </Button>
                </section>
            </main>
        );
    }

    return (
        <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-6 py-8">
            <section className="w-full space-y-4">
            <h1>Авторизация</h1>
            <p>Войдите или создайте новый аккаунт.</p>
            <nav className="flex gap-3">
                <Link
                    to="/auth/login"
                    activeProps={{}}
                >
                    Login
                </Link>
                <Link
                    to="/auth/register"
                    activeProps={{}}
                >
                    Register
                </Link>
            </nav>
            <Outlet />
            </section>
        </main>
    )
}

export function LoginForm() {
    const [loginValue, setLoginValue] = useState('');
    const [passwordValue, setPasswordValue] = useState('');

    const { mutate: login, isPending, isError, error } = useLogin({ login: loginValue, password: passwordValue });

    if(isError) {
        return <p>Error: {error.message}</p>;
    }

    if(isPending) {
        return <p>Loading...</p>;
    }

    return (
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); login(); }}>
            <Input type="text" placeholder="Login" value={loginValue} onChange={(e) => setLoginValue(e.target.value)} />
            <Input type="password" placeholder="Password" value={passwordValue} onChange={(e) => setPasswordValue(e.target.value)} />
            <Button type="submit">Login</Button>
        </form>
    )

}

export function RegisterForm() {
    const [loginValue, setLoginValue] = useState('');
    const [passwordValue, setPasswordValue] = useState('');
    const [confirmPasswordValue, setConfirmPasswordValue] = useState('');
    const { mutate: register, isPending, isError, error } = useRegister({ login: loginValue, password: passwordValue });

    if(isError) {
        return <p>Error: {error.message}</p>;
    }

    if(isPending) {
        return <p>Loading...</p>;
    }

    const handleRegister = () => {
        if(passwordValue !== confirmPasswordValue) {
            alert('Passwords do not match');
            return;
        }
        register();
    }
    
    return (
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); handleRegister(); }}>
            <Input type="text" placeholder="Login" value={loginValue} onChange={(e) => setLoginValue(e.target.value)} />
            <Input type="password" placeholder="Password" value={passwordValue} onChange={(e) => setPasswordValue(e.target.value)} />
            <Input type="password" placeholder="Confirm Password" value={confirmPasswordValue} onChange={(e) => setConfirmPasswordValue(e.target.value)} />
            <Button type="submit">Register</Button>
        </form>
    )
}