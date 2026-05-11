import type { Stored } from './db.js';

export type WorkerType = 'yandex-ocr-worker' | 'server-health-worker' | 'yandex-ping-worker';

export type WorkerStatus = 'active' | 'stopped' | 'failed';

export type BaseWorkerData = {
    type: WorkerType;
    status: WorkerStatus;
};

export type YandexOcrWorkerData = BaseWorkerData & {
    type: 'yandex-ocr-worker';
    fileId: string;
    fileContentId: string;
    mimeType: string;
    cloudOperationId?: string;
    operationDone: boolean;
    operationErrorMessage?: string;
    operationResult?: string;
};

export type ServerHealthWorkerData = BaseWorkerData & {
    type: 'server-health-worker';
    /** Общий объём диска в байтах */
    diskTotalBytes?: number;
    /** Занятое место в байтах */
    diskUsedBytes?: number;
    /** Доступное место в байтах */
    diskAvailableBytes?: number;
    /** Занятое место в процентах (0–100) */
    diskUsedPercent?: number;
};

export type YandexPingWorkerData = BaseWorkerData & {
    type: 'yandex-ping-worker';
    /** Задержка последнего пинга в миллисекундах. null — пинг не удался */
    latencyMs?: number | null;
    /** Unix-timestamp последнего пинга */
    lastPingedAt?: number;
};

export type WorkerData = YandexOcrWorkerData | ServerHealthWorkerData | YandexPingWorkerData;

/** Человекочитаемое представление данных воркера — плоский объект без заранее известной схемы. */
export type HumanReadableWorkerData = Record<string, unknown>;

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleString();
}

/**
 * Возвращает человекочитаемое представление данных воркера для отображения в UI.
 *
 * Системные поля БД (`id`, `createdAt`, `updatedAt`, `type`, `status`) намеренно исключены:
 * они уже присутствуют в шапке карточки воркера и дублировать их в теле нет смысла.
 *
 * Для каждого типа воркера определён свой обработчик, который преобразует сырые значения
 * в читаемый вид (байты → «1.2 GB», timestamp → локализованная строка и т.д.).
 * Если обработчик для типа не определён — возвращаются доменные поля воркера как есть,
 * без форматирования. Это гарантирует, что новый тип воркера не сломает UI до тех пор,
 * пока для него не будет написан обработчик.
 *
 * @example
 * // В компоненте карточки воркера:
 * const hrData = getHumanReadableWorkerData(worker);
 * <Text.Code language="json" as="pre">{JSON.stringify(hrData, null, 2)}</Text.Code>
 */
export function getHumanReadableWorkerData(worker: Stored<WorkerData>): HumanReadableWorkerData {
    switch (worker.type) {
        case 'server-health-worker':
            return {
                'Диск занято': worker.diskUsedPercent != null ? `${worker.diskUsedPercent}%` : '—',
                'Занято': worker.diskUsedBytes != null ? formatBytes(worker.diskUsedBytes) : '—',
                'Свободно': worker.diskAvailableBytes != null ? formatBytes(worker.diskAvailableBytes) : '—',
                'Всего': worker.diskTotalBytes != null ? formatBytes(worker.diskTotalBytes) : '—',
            };

        case 'yandex-ping-worker':
            return {
                'Задержка': worker.latencyMs != null ? `${worker.latencyMs} мс` : '—',
                'Последний пинг': worker.lastPingedAt != null ? formatTimestamp(worker.lastPingedAt) : '—',
            };

        case 'yandex-ocr-worker':
            return {
                'Файл': worker.fileId,
                'Тип файла': worker.mimeType,
                'Операция завершена': worker.operationDone ? 'да' : 'нет',
                ...(worker.operationErrorMessage != null && { 'Ошибка': worker.operationErrorMessage }),
                ...(worker.operationResult != null && { 'Результат': worker.operationResult }),
            };

        default: {
            // Новый тип без обработчика — возвращаем доменные поля без системных
            const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, type: _type, status: _status, ...rest } = worker as Stored<WorkerData> & Record<string, unknown>;
            return rest;
        }
    }
}
