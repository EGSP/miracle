/**
 * Примерная оценка числа токенов по тексту — общая для фронта и бэкенда.
 *
 * Грубая эвристика «символы ÷ symbolsPerToken»: точного токенайзера не нужно, оценка нужна лишь для
 * принятия решения о разбиении группы позиций на подгруппы (см. алгоритм анализа заказа v2).
 */
export function estimateTokens(text: string, symbolsPerToken = 4): number {
    return Math.ceil(text.length / symbolsPerToken);
}

/** Статус записи расхода токенов в ledger: submitted (запрос отправлен) → completed/failed. */
export type LlmUsageStatus = 'submitted' | 'completed' | 'failed';

/**
 * Запись расхода токенов одного LLM-запроса (строка ledger `llm_usage_records`) — общий контракт
 * фронта и бэкенда. Даты сериализуются по HTTP как ISO-строки.
 *
 * Трио `inputTokens`/`outputTokens`/`totalTokens` — фактические значения из `usage` ответа провайдера
 * (`null`, если он их не вернул); `estimatedInputTokens` — оценка отправленных токенов на submit.
 * Измерения атрибуции (orderId/userId/jobRunId/fileId/…) лежат в открытом {@link LlmUsageRecord.tags}.
 */
export type LlmUsageRecord = {
    id: string;
    /** Помеченный тегом транспорта id запроса (sdk:<opId> / openai:<respId>). */
    responseId: string;
    transport: string;
    model: string;
    status: LlmUsageStatus;
    tags: Record<string, string>;
    estimatedInputTokens: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    error: string | null;
    /** ISO-строка. */
    createdAt: string;
    /** ISO-строка; `null`, пока запрос не завершён. */
    completedAt: string | null;
};

/**
 * Суммарный расход токенов по одному заказу за всё время (агрегат ledger по `tags->>'orderId'`).
 * Считаются только завершённые (`completed`) записи; `null`-значения токенов трактуются как 0.
 */
export type LlmUsageByOrder = {
    orderId: string;
    /** Имя заказа; `null`/пустое — в UI показывается id (см. {@link orderDisplayName}). */
    orderName: string | null;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    /** Число завершённых LLM-запросов заказа. */
    requests: number;
    /** Разбивка по типам джоб — для pie-чарта в карточке заказа. */
    byJob: LlmUsageByJob[];
    /** Разбивка по моделям — для расчёта примерной стоимости. */
    byModel: LlmUsageByModel[];
};

/**
 * Суммарный расход токенов по типу джобы внутри одного заказа (агрегат ledger по `tags->>'orderId'`
 * с join на `job_runs` по `tags->>'jobRunId'`). Только завершённые записи с привязкой к заказу.
 */
export type LlmUsageByJob = {
    /** Идентификатор типа джобы (`job_runs.job`): analyse-order-v2, extract-positions-from-chunk, … */
    jobId: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    /** Число завершённых LLM-запросов этого типа джобы в заказе. */
    requests: number;
};

/**
 * Суммарный расход токенов по модели внутри одного заказа (агрегат ledger по `tags->>'orderId'`,
 * группировка по полю `model`). Только завершённые записи с привязкой к заказу.
 */
export type LlmUsageByModel = {
    /** Значение `model` из ledger (короткое имя или `gpt://…` URI). */
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    requests: number;
};
