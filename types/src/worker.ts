import type { Stored } from './db.js';
import type { OrderDetails } from './order.js';

export type WorkerType = 'yandex-ocr-worker' | 'llm-vision-worker' | 'server-health-worker' | 'yandex-ping-worker' | 'order-details-worker';

export const WorkerStatus = {
    Active: 'active',
    Success: 'success',
    Stopped: 'stopped',
    Failed: 'failed',
} as const;

export type WorkerStatus = typeof WorkerStatus[keyof typeof WorkerStatus];

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

export type OrderDetailsWorkerData = BaseWorkerData & {
    type: 'order-details-worker';
    orderId: string;
    cloudOperationId?: string;
    orderDetails?: OrderDetails;
    errorMessage?: string;
};

export type LlmVisionWorkerData = BaseWorkerData & {
    type: 'llm-vision-worker';
    fileId: string;
    fileContentId: string;
    /** ID асинхронной операции Yandex — сохраняется для восстановления после перезапуска. */
    cloudOperationId?: string;
    /** Текстовый ответ LLM после завершения операции. */
    operationResult?: string;
    /** Сообщение об ошибке при неуспешном завершении. */
    errorMessage?: string;
};

export type WorkerData = YandexOcrWorkerData | LlmVisionWorkerData | ServerHealthWorkerData | YandexPingWorkerData | OrderDetailsWorkerData;

/** Человекочитаемое представление данных воркера — плоский объект без заранее известной схемы. */
export type HumanReadableWorkerData = Record<string, unknown>;

export type WorkersQuery = {
    status?: WorkerStatus;
    /** Порядок сортировки по дате создания. По умолчанию — без сортировки (порядок хранения). */
    sort?: 'asc' | 'desc';
};

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
 * Пробует распарсить строку как JSON.
 * Если строка является валидным JSON — возвращает распарсенное значение (объект/массив/число и т.д.),
 * иначе возвращает исходную строку.
 *
 * Используется чтобы избежать двойного экранирования: если в БД хранится JSON-строка
 * (например, сериализованный объект ошибки), то при финальном JSON.stringify в UI
 * она не превратится в строку со слешами, а останется нормальным вложенным объектом.
 */
function tryParseJson(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
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
                ...(worker.operationErrorMessage != null && { 'Ошибка': tryParseJson(worker.operationErrorMessage) }),
                ...(worker.operationResult != null && { 'Результат': worker.operationResult }),
            };

        case 'llm-vision-worker':
            return {
                'Файл': worker.fileId,
                ...(worker.cloudOperationId != null && { 'LLM операция': worker.cloudOperationId }),
                ...(worker.operationResult != null && { 'Результат': worker.operationResult }),
                ...(worker.errorMessage != null && { 'Ошибка': tryParseJson(worker.errorMessage) }),
            };

        case 'order-details-worker':
            return {
                'Заказ': worker.orderId,
                ...(worker.cloudOperationId != null && { 'LLM операция': worker.cloudOperationId }),
                ...(worker.orderDetails != null && { 'Результат': worker.orderDetails }),
                ...(worker.errorMessage != null && { 'Ошибка': worker.errorMessage }),
            };

        default: {
            // Новый тип без обработчика — возвращаем доменные поля без системных
            const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, type: _type, status: _status, ...rest } = worker as Stored<WorkerData> & Record<string, unknown>;
            return rest;
        }
    }
}
