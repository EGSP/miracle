/** Статус подготовки документа в DPS. */
export type PrepareStatus = 'queued' | 'running' | 'succeed' | 'failed';

/** Движок подготовки документа. */
export type PreparedEngine = 'kreuzberg' | 'llm-vision';

export type PreparedPage = {
    page: number;
    markdown: string;
};

/** Результат подготовки файла в markdown (модель `PreparedDocument` без полей {@link DbEntity}). */
export type PreparedDocument = {
    fileId: string;
    status: PrepareStatus;
    engine: PreparedEngine;
    /** Ручной запрос разрешил LLM Vision для этого файла в обход глобального `LLM_VISION_ENABLED`. */
    allowVision: boolean;
    markdown?: string | null;
    pages?: PreparedPage[] | null;
    meta?: Record<string, unknown> | null;
    error?: string | null;
    jobRunId?: string | null;
};
