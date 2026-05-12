import { IconIndicator, Stack, Text } from '@miracle/aramid';
import { Link } from '@tanstack/react-router';
import { FileIcon } from 'lucide-react';
import { WorkerStatus, getHumanReadableWorkerData } from '@miracle/types';
import type { Stored, WorkerData } from '@miracle/types';
import { WorkerIcon } from '@/components/blocks/WorkerIcon';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/api';
import { useApplyWorkerData } from '@/lib/queries/workers.query';

type WorkerCardProps = {
    worker: Stored<WorkerData>;
};

function getStatusIndicator(status: string): {
    kind: 'succeeded' | 'failed' | 'in-progress';
    label: string;
} {
    switch (status) {
        case WorkerStatus.Active:
            return { kind: 'in-progress', label: 'Выполняется' };
        case WorkerStatus.Success:
            return { kind: 'succeeded', label: 'Выполнен' };
        case WorkerStatus.Stopped:
            return { kind: 'succeeded', label: 'Остановлен' };
        case WorkerStatus.Failed:
            return { kind: 'failed', label: 'Ошибка' };
        default:
            return { kind: 'in-progress', label: status };
    }
}

function getWorkerLabel(type: WorkerData['type']): string {
    switch (type) {
        case 'yandex-ocr-worker':
            return 'Yandex OCR';
        case 'order-details-worker':
            return 'Анализ заказа';
        case 'llm-vision-worker':
            return 'LLM Vision извлечение';
    }
}

export function WorkerCard({ worker }: WorkerCardProps) {
    const indicator = getStatusIndicator(worker.status);
    const hrData = getHumanReadableWorkerData(worker);
    const applyMutation = useApplyWorkerData();
    const showApplyButton = worker.status === WorkerStatus.Success;

    return (
        <Stack gap={3} className="border border-border p-3">
            <Stack orientation="horizontal" gap={2} className="items-center">
                <WorkerIcon className="size-4 shrink-0" />
                <Text.Heading as="h3" variant="compact-01" className="flex-1 truncate">
                    {getWorkerLabel(worker.type)}
                </Text.Heading>
                <IconIndicator kind={indicator.kind} label={indicator.label} size={16} />
            </Stack>

            {showApplyButton ? (
                <Stack gap={2}>
                    <div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={applyMutation.isPending}
                            onClick={() => applyMutation.mutate(worker.id)}
                        >
                            {applyMutation.isPending ? 'Применение...' : 'Применить результат'}
                        </Button>
                    </div>
                    {applyMutation.isError ? (
                        <Text as="p" compact className="text-destructive">
                            {getApiErrorMessage(applyMutation.error)}
                        </Text>
                    ) : null}
                </Stack>
            ) : null}

            <Stack gap={1}>
                <Stack orientation="horizontal" gap={2} className="items-center">
                    <Text.Label as="span" className="text-muted-foreground">Статус</Text.Label>
                    <Text.Label as="span">{indicator.label}</Text.Label>
                </Stack>
                <Text.Label as="span" className="text-muted-foreground">
                    ID: {worker.id}
                </Text.Label>
                <Text.Label as="span" className="text-muted-foreground">
                    Обновлён: {new Date(worker.updatedAt).toLocaleString()}
                </Text.Label>
                {(worker.type === 'yandex-ocr-worker' || worker.type === 'llm-vision-worker') && (
                    <Link to="/files" search={{ fileId: worker.fileId }} className="inline-flex items-center gap-1">
                        <FileIcon className="size-3 shrink-0" />
                        <Text as="span" compact>Файл</Text>
                    </Link>
                )}
                {worker.type === 'order-details-worker' && (
                    <Link to="/orders" search={{ orderId: worker.orderId }} className="inline-flex items-center gap-1">
                        <FileIcon className="size-3 shrink-0" />
                        <Text as="span" compact>Заказ</Text>
                    </Link>
                )}
            </Stack>

            <div className="border border-border bg-muted/20 p-2">
                <Text.Code as="pre" language="json" variant="md">
                    {JSON.stringify(hrData, null, 2)}
                </Text.Code>
            </div>
        </Stack>
    );
}
