/** Движок подготовки документа. */
export type PreparedEngine = 'kreuzberg' | 'llm-vision';

export type PreparedPage = {
    page: number;
    markdown: string;
};

/** Унифицированный результат извлечения. */
export type PreparedResult = {
    markdown: string;
    pages?: PreparedPage[];
    meta?: Record<string, unknown>;
};
