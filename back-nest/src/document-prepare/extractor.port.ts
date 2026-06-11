import type { Effect } from 'effect';
import type { FileModel } from '@miracle/types';

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

export type ExtractError = {
    readonly _tag: 'ExtractError';
    readonly message: string;
};

/** Порт извлечения содержимого файла в markdown. */
export interface DocumentExtractor {
    readonly engine: PreparedEngine;
    extract(
        file: FileModel,
        path: string,
    ): Effect.Effect<PreparedResult, ExtractError>;
}
