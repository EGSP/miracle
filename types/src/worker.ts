export type WorkerType = 'yandex-ocr-worker';

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

export type WorkerData = YandexOcrWorkerData;
