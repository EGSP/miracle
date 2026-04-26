import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLogin, useRegister } from "@/lib/queries/auth.query";
import { useAuthStore } from "@/lib/stores/auth.store";
import { Link, Outlet } from "@tanstack/react-router";
import { useState } from "react"

export function AuthPage() {

    const authStore = useAuthStore();
    if(authStore.status === 'valid') {
        return <div>Logged in</div>;
    }

    return (
        <div>
            <h1>Auth</h1>
            <nav>
                <Link to="/auth/login">Login</Link>
                <Link to="/auth/register">Register</Link>
            </nav>
            <Outlet />
        </div>
    )
}

export function LoginForm() {
    const [loginValue, setLoginValue] = useState('');
    const [passwordValue, setPasswordValue] = useState('');

    const { mutate: login, isPending, isError, error } = useLogin({ login: loginValue, password: passwordValue });

    if(isError) {
        return <div>Error: {error.message}</div>;
    }

    if(isPending) {
        return <div>Loading...</div>;
    }

    return (
        <div>
            <Input type="text" placeholder="Login" value={loginValue} onChange={(e) => setLoginValue(e.target.value)} />
            <Input type="password" placeholder="Password" value={passwordValue} onChange={(e) => setPasswordValue(e.target.value)} />
            <Button type="button" onClick={() => login()}>Login</Button>
        </div>
    )

}

export function RegisterForm() {
    const [loginValue, setLoginValue] = useState('');
    const [passwordValue, setPasswordValue] = useState('');
    const [confirmPasswordValue, setConfirmPasswordValue] = useState('');
    const { mutate: register, isPending, isError, error } = useRegister({ login: loginValue, password: passwordValue });

    if(isError) {
        return <div>Error: {error.message}</div>;
    }

    if(isPending) {
        return <div>Loading...</div>;
    }

    const handleRegister = () => {
        if(passwordValue !== confirmPasswordValue) {
            alert('Passwords do not match');
            return;
        }
        register();
    }
    
    return (
        <div>
            <Input type="text" placeholder="Login" value={loginValue} onChange={(e) => setLoginValue(e.target.value)} />
            <Input type="password" placeholder="Password" value={passwordValue} onChange={(e) => setPasswordValue(e.target.value)} />
            <Input type="password" placeholder="Confirm Password" value={confirmPasswordValue} onChange={(e) => setConfirmPasswordValue(e.target.value)} />
            <Button type="button" onClick={handleRegister}>Register</Button>
        </div>
    )
}