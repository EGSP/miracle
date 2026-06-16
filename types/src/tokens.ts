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
};
