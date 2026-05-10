import { IconIndicator, Stack, Text } from '@miracle/aramid';
import type { Stored, WorkerData, WorkerStatus } from '@miracle/types';
import { getHumanReadableWorkerData } from '@miracle/types';
import { WorkerIcon } from '@/components/blocks/WorkerIcon';

type WorkerCardProps = {
    worker: Stored<WorkerData>;
};

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

export function WorkerCard({ worker }: WorkerCardProps) {
    const indicator = getStatusIndicator(worker.status);
    const hrData = getHumanReadableWorkerData(worker);

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
                <Text.Code as="pre" language="json" className="whitespace-pre-wrap break-all">
                    {JSON.stringify(hrData, null, 2)}
                </Text.Code>
            </div>
        </Stack>
    );
}
