import { IconIndicator, Stack, Text } from '@miracle/aramid';
import type { Stored, WorkerData, WorkerStatus } from '@miracle/types';
import { WorkerIcon } from '@/components/blocks/WorkerIcon';

type WorkerCardProps = {
    worker: Stored<WorkerData>;
};

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleTimeString();
}

function getStatusIndicator(status: WorkerStatus): {
    kind: 'succeeded' | 'failed' | 'in-progress';
    label: string;
} {
    switch (status) {
        case 'active':
            return { kind: 'in-progress', label: 'Выполняется' };
        case 'stopped':
            return { kind: 'succeeded', label: 'Остановлен' };
        case 'failed':
            return { kind: 'failed', label: 'Ошибка' };
    }
}

function getWorkerLabel(type: WorkerData['type']): string {
    switch (type) {
        case 'yandex-ocr-worker':
            return 'Yandex OCR';
        case 'server-health-worker':
            return 'Мониторинг диска';
        case 'yandex-ping-worker':
            return 'Ping Яндекса';
    }
}

function WorkerDetails({ worker }: { worker: Stored<WorkerData> }) {
    if (worker.type === 'server-health-worker') {
        const { diskTotalBytes, diskUsedBytes, diskAvailableBytes, diskUsedPercent } = worker;

        if (diskTotalBytes == null) {
            return <Text.Label as="p">Ожидание данных...</Text.Label>;
        }

        return (
            <Stack gap={1}>
                <Text.Label as="p">
                    Диск: {diskUsedPercent}% занято
                </Text.Label>
                <Text.Label as="p">
                    Занято: {formatBytes(diskUsedBytes ?? 0)} / {formatBytes(diskTotalBytes)}
                </Text.Label>
                <Text.Label as="p">
                    Свободно: {formatBytes(diskAvailableBytes ?? 0)}
                </Text.Label>
            </Stack>
        );
    }

    if (worker.type === 'yandex-ping-worker') {
        const { latencyMs, lastPingedAt } = worker;

        if (lastPingedAt == null) {
            return <Text.Label as="p">Ожидание первого пинга...</Text.Label>;
        }

        return (
            <Stack gap={1}>
                <Text.Label as="p">
                    Задержка:{' '}
                    {latencyMs == null ? '—' : `${latencyMs} мс`}
                </Text.Label>
                <Text.Label as="p">
                    Последний пинг: {formatTimestamp(lastPingedAt)}
                </Text.Label>
            </Stack>
        );
    }

    if (worker.type === 'yandex-ocr-worker') {
        return (
            <Stack gap={1}>
                <Text.Label as="p">
                    Файл: {worker.fileId}
                </Text.Label>
                <Text.Label as="p">
                    {worker.operationDone ? 'Операция завершена' : 'Ожидание OCR...'}
                </Text.Label>
                {worker.operationErrorMessage && (
                    <Text.Label as="p" className="text-destructive">
                        {worker.operationErrorMessage}
                    </Text.Label>
                )}
            </Stack>
        );
    }

    return null;
}

export function WorkerCard({ worker }: WorkerCardProps) {
    const indicator = getStatusIndicator(worker.status);

    return (
        <Stack gap={3} className="border border-border p-3">
            <Stack orientation="horizontal" gap={2} className="items-center">
                <WorkerIcon className="size-4 shrink-0" />
                <Text.Heading as="h3" variant="compact-01" className="flex-1 truncate">
                    {getWorkerLabel(worker.type)}
                </Text.Heading>
                <IconIndicator kind={indicator.kind} label={indicator.label} size={16} />
            </Stack>

            <Stack gap={1}>
                <Stack orientation="horizontal" gap={2} className="items-center">
                    <Text.Label as="span" className="text-muted-foreground">Статус</Text.Label>
                    <Text.Label as="span">{indicator.label}</Text.Label>
                </Stack>
                <Text.Label as="span" className="text-muted-foreground">
                    ID: {worker.id}
                </Text.Label>
            </Stack>

            <div className="border border-border bg-muted/20 p-2">
                <WorkerDetails worker={worker} />
            </div>
        </Stack>
    );
}
