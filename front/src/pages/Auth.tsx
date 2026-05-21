import { useState, type ReactNode } from 'react';
import { Link, Outlet } from '@tanstack/react-router';
import { Column, Grid, Stack, Text } from '@miracle/aramid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthContext } from '@/contexts/AuthContext';
import { useLogin, useLogout, useRegister } from '@/lib/queries/auth.query';

const AUTH_CONTENT = { span: 16 as const };

function authShell(children: ReactNode) {
    return (
        <Grid as="main">
            <Column span={AUTH_CONTENT}>
                <Stack gap={4}>
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
                    <Text.Heading as="h1" variant="04">
                        Вы авторизованы
                    </Text.Heading>
                    <Text as="p" compact>
                        Сессия активна. Можно перейти к рабочим разделам приложения.
                    </Text>
                </Stack>
                <Stack orientation="horizontal" gap={3} className="flex-wrap items-center">
                    <Link to="/">
                        <Text as="span" compact expressive>
                            На главную
                        </Text>
                    </Link>
                    <Button
                        type="button"
                        variant="tertiary"
                        label={isLogoutPending ? 'Выйти из аккаунта...' : 'Выйти из аккаунта'}
                        onClick={() => logout()}
                        disabled={isLogoutPending}
                    />
                </Stack>
            </>
        );
    }

    return authShell(
        <>
            <Stack gap={1}>
                <Text.Heading as="h1" variant="04">
                    Авторизация
                </Text.Heading>
                <Text as="p" compact>
                    Войдите или создайте новый аккаунт.
                </Text>
            </Stack>
            <Stack as="nav" orientation="horizontal" gap={4} className="flex-wrap">
                <Link to="/">
                    <Text as="span" compact expressive>
                        На главную
                    </Text>
                </Link>
                <Link to="/auth/login">
                    <Text as="span" compact expressive>
                        Вход
                    </Text>
                </Link>
                <Link to="/auth/register">
                    <Text as="span" compact expressive>
                        Регистрация
                    </Text>
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
            {isError && <Text.Label as="p">Ошибка: {error.message}</Text.Label>}
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
            <Button type="submit" label={isPending ? 'Вход...' : 'Войти'} disabled={isPending} />
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
            {isError && <Text.Label as="p">Ошибка: {error.message}</Text.Label>}
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
            <Button type="submit" label={isPending ? 'Регистрация...' : 'Зарегистрироваться'} disabled={isPending} />
        </Stack>
    );
}
