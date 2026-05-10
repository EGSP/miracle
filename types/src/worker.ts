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
