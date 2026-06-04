import type { Stored } from './db.js';
import type { Content } from './file-content.js';

export type WorkerType =
    | 'yandex-ocr-worker'
    | 'llm-vision-worker'
    | 'llm-vision-tc-worker'
    | 'order-details-worker'
    | 'tc-details-worker'
    | 'designation-worker';

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
    /** Страницы OCR после `run`; в целевой file-content попадают в `apply`. */
    ocrPages?: Content[];
};

export type OrderDetailsWorkerData = BaseWorkerData & {
    type: 'order-details-worker';
    orderId: string;
    cloudOperationId?: string;
    /**
     * Собранный промпт (system + user), как он ушёл в LLM.
     * Сохраняется до submitCompletion в run(). Показывается на /worker-prompt.
     */
    finalPrompt?: WorkerFinalPrompt;
    // TODO(воркеры): переезд на OrderPosition. Тип-заглушка до рефактора order-details-worker.
    orderDetails?: unknown;
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

/**
 * Читает PDF ТУ, рендерит страницы в изображения, вызывает Yandex Vision LLM (async).
 * В apply() записывает извлечённый markdown-текст в FileContent.content.
 */
export type LlmVisionTcWorkerData = BaseWorkerData & {
    type: 'llm-vision-tc-worker';
    fileId: string;
    fileContentId: string;
    cloudOperationId?: string;
    operationResult?: string;
    errorMessage?: string;
};

/**
 * Читает уже извлечённый текст ТУ из FileContent (через TC.fileId).
 * Вызывает Yandex LLM text (async) — разбивает текст на SlotRule[].
 * В apply() полностью заменяет TC.slotRules.
 */
export type TCDetailsWorkerData = BaseWorkerData & {
    type: 'tc-details-worker';
    /** TC, чьи slotRules нужно заполнить. */
    tcId: string;
    /** ID асинхронной операции Yandex — сохраняется для восстановления после перезапуска. */
    cloudOperationId?: string;
    /** JSON-строка с результатом LLM до apply(). Структура: { sections: RawSection[] } */
    operationResult?: string;
    /** Сообщение об ошибке при неуспешном завершении. */
    errorMessage?: string;
};

/**
 * Вход DesignationWorker — что анализируем и по какому ТУ.
 * Капсула: воркер хранит этот объект как `input` и эндпоинт принимает его целиком
 * как тело запроса. При расширении (например, выбор templateId)
 * не разрастается shape воркера и не меняется сигнатура эндпоинта.
 */
export type DesignationWorkerInput = {
    /** Заказ, для которого определяется обозначение. */
    orderId: string;
    /** TC, по правилам которого ведётся определение. */
    tcId: string;
};

/**
 * Финальный промпт, собранный воркером до отправки в LLM.
 * Хранится в воркере для отладки: показывает ровно то, что ушло в модель,
 * даже если Order или TC потом изменились/удалились.
 */
export type WorkerFinalPrompt = {
    system: string;
    user: string;
};

/**
 * Читает SlotRule[] из TC + requirements из позиции заказа.
 * Вызывает Yandex LLM (async) → возвращает DesignationValue[].
 * В apply() записывает результат в Order.details.designation.ai.
 */
export type DesignationWorkerData = BaseWorkerData & {
    type: 'designation-worker';
    /** Капсула входных данных воркера. */
    input: DesignationWorkerInput;
    /** ID асинхронной операции Yandex — сохраняется для восстановления. */
    cloudOperationId?: string;
    /**
     * Собранный промпт (system + user), как он ушёл в LLM.
     * Сохраняется до submitCompletion в run(). Показывается на отдельной
     * странице /worker-prompt; в карточке воркера не отображается (большой текст).
     */
    finalPrompt?: WorkerFinalPrompt;
    /** JSON с { values: DesignationValue[] } — заполняется после завершения операции. */
    operationResult?: string;
    /** Сообщение об ошибке при неуспешном завершении. */
    errorMessage?: string;
};

export type WorkerData =
    | YandexOcrWorkerData
    | LlmVisionWorkerData
    | LlmVisionTcWorkerData
    | OrderDetailsWorkerData
    | TCDetailsWorkerData
    | DesignationWorkerData;

/** Человекочитаемое представление данных воркера — плоский объект без заранее известной схемы. */
export type HumanReadableWorkerData = Record<string, unknown>;

export type WorkersQuery = {
    status?: WorkerStatus;
    /** Порядок сортировки по дате создания. По умолчанию — без сортировки (порядок хранения). */
    sort?: 'asc' | 'desc';
};

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
 * в читаемый вид при необходимости.
 * Если обработчик для типа не определён — возвращаются доменные поля воркера как есть,
 * без форматирования. Это гарантирует, что новый тип воркера не сломает UI до тех пор,
 * пока для него не будет написан обработчик.
 *
 * @example
 * // В компоненте карточки воркера:
 * const hrData = getHumanReadableWorkerData(worker);
 * <CodeSnippet language="json" variant="md">{JSON.stringify(hrData, null, 2)}</CodeSnippet>
 */
export function getHumanReadableWorkerData(worker: Stored<WorkerData>): HumanReadableWorkerData {
    switch (worker.type) {
        case 'yandex-ocr-worker':
            return {
                'Файл': worker.fileId,
                'Тип файла': worker.mimeType,
                'Операция завершена': worker.operationDone ? 'да' : 'нет',
                ...(worker.operationErrorMessage != null && { 'Ошибка': tryParseJson(worker.operationErrorMessage) }),
                ...(worker.operationResult != null && { 'Результат': worker.operationResult }),
                ...(worker.ocrPages != null && worker.ocrPages.length > 0 && { 'Страниц OCR (к apply)': worker.ocrPages.length }),
            };

        case 'llm-vision-worker':
            return {
                'Файл': worker.fileId,
                ...(worker.cloudOperationId != null && { 'LLM операция': worker.cloudOperationId }),
                ...(worker.operationResult != null && { 'Результат': worker.operationResult }),
                ...(worker.errorMessage != null && { 'Ошибка': tryParseJson(worker.errorMessage) }),
            };

        case 'llm-vision-tc-worker':
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

        case 'tc-details-worker':
            return {
                'TC': worker.tcId,
                ...(worker.cloudOperationId != null && { 'LLM операция': worker.cloudOperationId }),
                ...(worker.operationResult != null && { 'Результат (разделы)': tryParseJson(worker.operationResult) }),
                ...(worker.errorMessage != null && { 'Ошибка': tryParseJson(worker.errorMessage) }),
            };

        case 'designation-worker':
            return {
                'Заказ': worker.input.orderId,
                'TC': worker.input.tcId,
                ...(worker.cloudOperationId != null && { 'LLM операция': worker.cloudOperationId }),
                ...(worker.operationResult != null && { 'Результат (значения слотов)': tryParseJson(worker.operationResult) }),
                ...(worker.errorMessage != null && { 'Ошибка': tryParseJson(worker.errorMessage) }),
            };

        default: {
            // Новый тип без обработчика — возвращаем доменные поля без системных
            const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, type: _type, status: _status, ...rest } = worker as Stored<WorkerData> & Record<string, unknown>;
            return rest;
        }
    }
}
