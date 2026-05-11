import { useState } from 'react';
import { Column, Grid, IconIndicator, Stack, Text } from '@miracle/aramid';
import { Link } from '@tanstack/react-router';
import type { IconIndicatorKind } from '@miracle/aramid';
import { WorkerStatus } from '@miracle/types';
import { WorkerCard } from '@/components/blocks/WorkerCard';
import { WorkerIcon } from '@/components/blocks/WorkerIcon';
import { useGetWorkers } from '@/lib/queries/workers.query';

const PAGE_CONTENT = { span: 14 as const, offset: 1 as const };

type WorkerGroup = {
    status: WorkerStatus;
    label: string;
    indicatorKind: IconIndicatorKind;
};

const WORKER_GROUPS: WorkerGroup[] = [
    { status: WorkerStatus.Active, label: 'Активные', indicatorKind: 'in-progress' },
    { status: WorkerStatus.Success, label: 'Выполненные', indicatorKind: 'succeeded' },
    { status: WorkerStatus.Failed, label: 'С ошибкой', indicatorKind: 'failed' },
    { status: WorkerStatus.Stopped, label: 'Остановленные', indicatorKind: 'pending' },
];

type WorkerGroupSidebarItemProps = WorkerGroup & {
    isSelected: boolean;
    onSelect: () => void;
};

function WorkerGroupSidebarItem({ status, label, indicatorKind, isSelected, onSelect }: WorkerGroupSidebarItemProps) {
    const { data } = useGetWorkers({ status, sort: 'desc' });
    const count = data?.length;

    return (
        <button
            type="button"
            onClick={onSelect}
            className={[
                'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
                isSelected
                    ? 'bg-foreground/5 border-l-2 border-foreground'
                    : 'border-l-2 border-transparent hover:bg-foreground/5',
            ].join(' ')}
        >
            <IconIndicator kind={indicatorKind} size={16} />
            <Text.Label as="span" className="flex-1">
                {label}
            </Text.Label>
            {count != null && (
                <Text.Label as="span" className="text-muted-foreground">
                    {count}
                </Text.Label>
            )}
        </button>
    );
}

function WorkerGroupContent({ status }: { status: WorkerStatus }) {
    const { data, isLoading, error } = useGetWorkers({ status, sort: 'desc' });

    if (isLoading) {
        return <Text.Label as="p">Загрузка...</Text.Label>;
    }

    if (error) {
        return (
            <Text as="p" compact className="text-destructive">
                Ошибка загрузки: {error.message}
            </Text>
        );
    }

    if (!data || data.length === 0) {
        return (
            <Text as="p" compact className="text-muted-foreground">
                Нет воркеров в этой группе
            </Text>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((worker) => (
                <WorkerCard key={worker.id} worker={worker} />
            ))}
        </div>
    );
}

export default function WorkersPage() {
    const [selectedStatus, setSelectedStatus] = useState<WorkerStatus>(WorkerStatus.Active);

    const selectedGroup = WORKER_GROUPS.find((g) => g.status === selectedStatus)!;

    return (
        <Grid as="main" className="min-h-screen">
            <Column span={PAGE_CONTENT} className="min-w-0 py-8">
                <Stack gap={6} className="w-full">
                    {/* Шапка страницы */}
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

                    {/* Основной контент: сайдбар + карточки */}
                    <div className="flex min-w-0 gap-6">
                        {/* Левый сайдбар: группы воркеров */}
                        <div className="w-44 shrink-0">
                            <Stack gap={1}>
                                {WORKER_GROUPS.map((group) => (
                                    <WorkerGroupSidebarItem
                                        key={group.status}
                                        {...group}
                                        isSelected={selectedStatus === group.status}
                                        onSelect={() => setSelectedStatus(group.status)}
                                    />
                                ))}
                            </Stack>
                        </div>

                        {/* Карточки выбранной группы */}
                        <div className="min-w-0 flex-1">
                            <Stack gap={3}>
                                <Text.Heading as="h2" variant="compact-01">
                                    {selectedGroup.label}
                                </Text.Heading>
                                <WorkerGroupContent status={selectedStatus} />
                            </Stack>
                        </div>
                    </div>
                </Stack>
            </Column>
        </Grid>
    );
}
