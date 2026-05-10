import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { FileIcon, ListOrdered } from 'lucide-react';
import { WorkerIcon } from '@/components/blocks/WorkerIcon';
import { Column, Grid, Stack, Text } from '@miracle/aramid';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCheckHealth, useRefetchHealth } from '@/lib/queries/health.query';

/** Центрирование на полной 16-колоночной сетке: 12 колонок контента, по 2 пустые с каждой стороны (как offset в Carbon). */
const HOME_CONTENT = { span: 12 as const, offset: 2 as const };

export default function HomePage() {
    const { data, isLoading, error } = useCheckHealth();
    const refetchHealth = useRefetchHealth();
    const { isAuthenticated } = useAuthContext();

    const localizedTimestamp = useMemo(() => {
        return new Date(data?.timestamp ?? '').toLocaleString();
    }, [data?.timestamp]);

    return (
        <Grid as="main" className="min-h-screen">
            <Column span={HOME_CONTENT} className="min-w-0 py-8">
                <Stack gap={6} className="w-full">
                    <Stack gap={1}>
                        <Text.Heading as="h1" variant="04">
                            Miracle
                        </Text.Heading>
                        <Text as="p" compact>
                            Обработка опросных листов ИИ агентом
                        </Text>
                    </Stack>

                    {isAuthenticated && (
                        <Stack as="section" gap={3}>
                            <Text.Heading as="h2" variant="compact-01">
                                Проверка состояния сервера
                            </Text.Heading>
                            <Stack gap={2}>
                                {isLoading && (
                                    <Text.Label as="p">Загрузка...</Text.Label>
                                )}
                                {error && (
                                    <Text.Label as="p">Ошибка: {error.message}</Text.Label>
                                )}
                                {data && (
                                    <Text as="p" compact>
                                        Состояние сервера: {data.status} от {localizedTimestamp}
                                    </Text>
                                )}
                            </Stack>
                            <Button type="button" onClick={refetchHealth}>
                                Проверить
                            </Button>
                        </Stack>
                    )}

                    <Stack as="section" gap={2}>
                        <Text.Heading as="h2" variant="compact-01">
                            Быстрый старт
                        </Text.Heading>
                        <Text as="p" compact>
                            Перейдите к странице входа и регистрации.
                        </Text>
                        <Link to="/auth">
                            <Text as="span" compact expressive>
                                Авторизация
                            </Text>
                        </Link>
                    </Stack>

                    {isAuthenticated && (
                        <Stack as="section" gap={2}>
                            <Text.Heading as="h2" variant="compact-02">
                                Заказы и файлы
                            </Text.Heading>
                            <Text as="p" compact expressive>
                                Переход к разделам для работы с заказами и файлами.
                            </Text>
                            <Stack orientation="horizontal" gap={4} className="flex-wrap items-center">
                                <Link to="/files" className="inline-flex items-center gap-1.5">
                                    <FileIcon className="size-3.5" />
                                    <Text as="span" compact expressive>
                                        Перейти к файлам
                                    </Text>
                                </Link>
                                <Link to="/orders" className="inline-flex items-center gap-1.5">
                                    <ListOrdered className="size-3.5" />
                                    <Text as="span" compact expressive>
                                        Перейти к заказам
                                    </Text>
                                </Link>
                                <Link to="/workers" className="inline-flex items-center gap-1.5">
                                    <WorkerIcon className="size-3.5" />
                                    <Text as="span" compact expressive>
                                        Воркеры
                                    </Text>
                                </Link>
                            </Stack>
                        </Stack>
                    )}
                </Stack>
            </Column>
        </Grid>
    );
}
