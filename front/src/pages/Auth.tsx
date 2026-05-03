import { useState, type ReactNode } from 'react';
import { Link, Outlet } from '@tanstack/react-router';
import { Column, Grid, Stack } from '@miracle/aramid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthContext } from '@/contexts/AuthContext';
import { useLogin, useLogout, useRegister } from '@/lib/queries/auth.query';

/** Узкая колонка формы по центру сетки: 8 из 16, отступы 4+4. */
const AUTH_CONTENT = { span: 8 as const, offset: 4 as const };

function authShell(children: ReactNode) {
    return (
        <Grid as="main" className="min-h-screen">
            <Column span={AUTH_CONTENT} className="min-w-0 py-8">
                <Stack gap={4} className="w-full">
                    {children}
                </Stack>
            </Column>
        </Grid>
    );
}

export function AuthPage() {
    const { mutate: logout, isPending: isLogoutPending } = useLogout();
    const { isAuthenticated } = useAuthContext();

    if (isAuthenticated) {
        return authShell(
            <>
                <Stack gap={1}>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Вы авторизованы</h1>
                    <p className="text-sm text-muted-foreground">
                        Сессия активна. Можно перейти к рабочим разделам приложения.
                    </p>
                </Stack>
                <Stack orientation="horizontal" gap={3} className="flex-wrap items-center">
                    <Link
                        to="/"
                        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                        На главную
                    </Link>
                    <Button type="button" variant="outline" onClick={() => logout()} disabled={isLogoutPending}>
                        {isLogoutPending ? 'Выйти из аккаунта...' : 'Выйти из аккаунта'}
                    </Button>
                </Stack>
            </>
        );
    }

    return authShell(
        <>
            <Stack gap={1}>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Авторизация</h1>
                <p className="text-sm text-muted-foreground">Войдите или создайте новый аккаунт.</p>
            </Stack>
            <Stack as="nav" orientation="horizontal" gap={4} className="flex-wrap">
                <Link
                    to="/auth/login"
                    className="text-sm font-medium text-muted-foreground data-[status=active]:text-foreground"
                >
                    Вход
                </Link>
                <Link
                    to="/auth/register"
                    className="text-sm font-medium text-muted-foreground data-[status=active]:text-foreground"
                >
                    Регистрация
                </Link>
            </Stack>
            <Outlet />
        </>
    );
}

export function LoginForm() {
    const [loginValue, setLoginValue] = useState('');
    const [passwordValue, setPasswordValue] = useState('');
    const { mutate: login, isPending, isError, error } = useLogin({ login: loginValue, password: passwordValue });

    return (
        <Stack as="form" gap={3} onSubmit={(e) => { e.preventDefault(); login(); }}>
            {isError && <p className="text-sm text-destructive">Ошибка: {error.message}</p>}
            <Input
                type="text"
                placeholder="Логин"
                autoComplete="username"
                value={loginValue}
                onChange={(e) => setLoginValue(e.target.value)}
                disabled={isPending}
            />
            <Input
                type="password"
                placeholder="Пароль"
                autoComplete="current-password"
                value={passwordValue}
                onChange={(e) => setPasswordValue(e.target.value)}
                disabled={isPending}
            />
            <Button type="submit" disabled={isPending}>
                {isPending ? 'Вход...' : 'Войти'}
            </Button>
        </Stack>
    );
}

export function RegisterForm() {
    const [loginValue, setLoginValue] = useState('');
    const [passwordValue, setPasswordValue] = useState('');
    const [confirmPasswordValue, setConfirmPasswordValue] = useState('');
    const { mutate: register, isPending, isError, error } = useRegister({ login: loginValue, password: passwordValue });

    const handleRegister = () => {
        if (passwordValue !== confirmPasswordValue) {
            alert('Пароли не совпадают');
            return;
        }
        register();
    };

    return (
        <Stack as="form" gap={3} onSubmit={(e) => { e.preventDefault(); handleRegister(); }}>
            {isError && <p className="text-sm text-destructive">Ошибка: {error.message}</p>}
            <Input
                type="text"
                placeholder="Логин"
                autoComplete="username"
                value={loginValue}
                onChange={(e) => setLoginValue(e.target.value)}
                disabled={isPending}
            />
            <Input
                type="password"
                placeholder="Пароль"
                autoComplete="new-password"
                value={passwordValue}
                onChange={(e) => setPasswordValue(e.target.value)}
                disabled={isPending}
            />
            <Input
                type="password"
                placeholder="Повторите пароль"
                autoComplete="new-password"
                value={confirmPasswordValue}
                onChange={(e) => setConfirmPasswordValue(e.target.value)}
                disabled={isPending}
            />
            <Button type="submit" disabled={isPending}>
                {isPending ? 'Регистрация...' : 'Зарегистрироваться'}
            </Button>
        </Stack>
    );
}
