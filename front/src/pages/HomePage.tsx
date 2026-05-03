import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { Column, Grid, Stack } from '@miracle/aramid';
import { Button } from '@/components/ui/button';
import { useCheckHealth, useRefetchHealth } from '@/lib/queries/health.query';

/** Центрирование на полной 16-колоночной сетке: 12 колонок контента, по 2 пустые с каждой стороны (как offset в Carbon). */
const HOME_CONTENT = { span: 12 as const, offset: 2 as const };

export default function HomePage() {
    const { data, isLoading, error } = useCheckHealth();
    const refetchHealth = useRefetchHealth();

    const localizedTimestamp = useMemo(() => {
        return new Date(data?.timestamp ?? '').toLocaleString();
    }, [data?.timestamp]);

    return (
        <Grid as="main" className="min-h-screen">
            <Column span={HOME_CONTENT} className="min-w-0 py-8">
                <Stack gap={6} className="w-full">
                    <Stack gap={1}>
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Miracle</h1>
                        <p className="text-sm text-muted-foreground">Обработка опросных листов ИИ агентом</p>
                    </Stack>

                    <Stack as="section" gap={3}>
                        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Проверка состояния сервера
                        </h2>
                        <Stack gap={2}>
                            {isLoading && <p className="text-sm text-muted-foreground">Загрузка...</p>}
                            {error && <p className="text-sm text-destructive">Ошибка: {error.message}</p>}
                            {data && (
                                <p className="text-sm text-foreground">
                                    Состояние сервера: {data.status} от {localizedTimestamp}
                                </p>
                            )}
                        </Stack>
                        <Button type="button" onClick={refetchHealth}>
                            Проверить
                        </Button>
                    </Stack>

                    <Stack as="section" gap={2}>
                        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Быстрый старт
                        </h2>
                        <p className="text-sm text-muted-foreground">Перейдите к странице входа и регистрации.</p>
                        <Link to="/auth" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                            Авторизация
                        </Link>
                    </Stack>

                    <Stack as="section" gap={2}>
                        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Файлы</h2>
                        <p className="text-sm text-muted-foreground">Загрузка и просмотр файлов.</p>
                        <Link to="/files" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                            Перейти к файлам
                        </Link>
                    </Stack>
                </Stack>
            </Column>
        </Grid>
    );
}
