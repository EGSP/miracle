import { CodeSnippet, IconIndicator, Layer, Stack, Text } from '@miracle/aramid';
import { Link } from '@tanstack/react-router';
import { FileIcon } from 'lucide-react';
import { WorkerStatus, getHumanReadableWorkerData } from '@miracle/types';
import type { Stored, WorkerData } from '@miracle/types';
import { WorkerIcon } from '@/components/blocks/WorkerIcon';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/api';
import { useApplyWorkerData, useDeleteWorker } from '@/lib/queries/workers.query';

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
        case 'llm-vision-tc-worker':
            return 'LLM Vision ТУ';
        case 'tc-details-worker':
            return 'Структурирование ТУ';
        case 'designation-worker':
            return 'Условное обозначение';
        default:
            return type;
    }
}

export function WorkerCard({ worker }: WorkerCardProps) {
    const indicator = getStatusIndicator(worker.status);
    const hrData = getHumanReadableWorkerData(worker);
    const applyMutation = useApplyWorkerData();
    const deleteMutation = useDeleteWorker();
    const showApplyButton = worker.status === WorkerStatus.Success;
    const showDeleteButton = worker.status !== WorkerStatus.Active;

    // Превью промпта — пока поддерживается только для designation-worker
    // (соответствует ограничению на бэке в /workers/:id/preview-prompt).
    const showPreviewPromptButton = worker.type === 'designation-worker';
    const openPromptPreview = () => {
        window.open(`/worker-prompt?workerId=${worker.id}`, '_blank', 'noopener,noreferrer');
    };

    return (
        <Layer>
            <Stack gap={3} className=" p-3">
                <Stack orientation="horizontal" gap={2} className="items-center">
                    <WorkerIcon className="size-4 shrink-0" />
                    <Text.Heading as="h3" variant="compact-01" className="flex-1 truncate">
                        {getWorkerLabel(worker.type)}
                    </Text.Heading>
                </Stack>
                <Stack gap={1}>
                    <Stack orientation="horizontal" gap={2} className="justify-between">
                        <IconIndicator kind={indicator.kind} label={indicator.label} size={16} />

                        <Text.Label as="span" className="text-muted-foreground">
                            Обновлён: {new Date(worker.updatedAt).toLocaleString()}
                        </Text.Label>
                    </Stack>
                    <Text.Label as="span" className="text-muted-foreground">
                        ID: {worker.id}
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

                <div className="border border-border bg-muted/20 p-2 w-full">
                    <CodeSnippet language="json" variant="md">
                        {JSON.stringify(hrData, null, 2)}
                    </CodeSnippet>
                </div>
                
                {showApplyButton || showDeleteButton || showPreviewPromptButton ? (
                    <Stack gap={2}>
                        <Stack orientation="horizontal" gap={2}>
                            {showApplyButton ? (
                                <Button
                                    type="button"
                                    variant="primary"
                                    size="sm"
                                    label={applyMutation.isPending ? 'Применение...' : 'Применить'}
                                    disabled={applyMutation.isPending || deleteMutation.isPending}
                                    onClick={() => applyMutation.mutate(worker.id)}
                                />
                            ) : null}
                            {showPreviewPromptButton ? (
                                <Button
                                    type="button"
                                    variant="tertiary"
                                    size="sm"
                                    label="Промпт"
                                    onClick={openPromptPreview}
                                />
                            ) : null}
                            {showDeleteButton ? (
                                <Button
                                    type="button"
                                    variant="danger-tertiary"
                                    size="sm"
                                    label={deleteMutation.isPending ? 'Удаление...' : 'Удалить'}
                                    disabled={deleteMutation.isPending || applyMutation.isPending}
                                    onClick={() => deleteMutation.mutate(worker.id)}
                                />
                            ) : null}
                        </Stack>
                        {applyMutation.isError ? (
                            <Text as="p" compact className="text-destructive">
                                {getApiErrorMessage(applyMutation.error)}
                            </Text>
                        ) : null}
                        {deleteMutation.isError ? (
                            <Text as="p" compact className="text-destructive">
                                {getApiErrorMessage(deleteMutation.error)}
                            </Text>
                        ) : null}
                    </Stack>
                ) : null}
            </Stack>
        </Layer>
    );
}
