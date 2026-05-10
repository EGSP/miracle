import { Column, Grid, Stack, Text } from '@miracle/aramid';
import { Link } from '@tanstack/react-router';
import { WorkerCard } from '@/components/blocks/WorkerCard';
import { WorkerIcon } from '@/components/blocks/WorkerIcon';
import { useGetWorkers } from '@/lib/queries/workers.query';

const PAGE_CONTENT = { span: 12 as const, offset: 2 as const };

export default function WorkersPage() {
    const { data: workersList, isLoading, error } = useGetWorkers();

    return (
        <Grid as="main" className="min-h-screen">
            <Column span={PAGE_CONTENT} className="min-w-0 py-8">
                <Stack gap={6} className="w-full">
                    <Stack orientation="horizontal" gap={3} className="items-center">
                        <WorkerIcon className="size-6" />
                        <Stack gap={1}>
                            <Text.Heading as="h1" variant="04">
                                Воркеры
                            </Text.Heading>
                            <Text as="p" compact>
                                Фоновые задачи сервера
                            </Text>
                            <Link to="/">
                                <Text as="span" compact expressive>
                                    На главную
                                </Text>
                            </Link>
                        </Stack>
                    </Stack>

                    {isLoading && (
                        <Text.Label as="p">Загрузка...</Text.Label>
                    )}

                    {error && (
                        <Text as="p" compact className="text-destructive">
                            Ошибка загрузки: {error.message}
                        </Text>
                    )}

                    {workersList && workersList.length === 0 && (
                        <Text as="p" compact className="text-muted-foreground">
                            Воркеры не найдены
                        </Text>
                    )}

                    {workersList && workersList.length > 0 && (
                        <Stack gap={3}>
                            <Text.Heading as="h2" variant="compact-01">
                                Активные и завершённые воркеры ({workersList.length})
                            </Text.Heading>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {workersList.map((worker) => (
                                    <WorkerCard key={worker.id} worker={worker} />
                                ))}
                            </div>
                        </Stack>
                    )}
                </Stack>
            </Column>
        </Grid>
    );
}
