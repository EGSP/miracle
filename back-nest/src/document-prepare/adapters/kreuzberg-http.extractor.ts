import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import path from 'path';
import { Effect } from 'effect';
import type { FileModel } from '@miracle/types';
import { formatUnknown } from '../../common/effect-errors.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { PreparedResult } from '../extractor.port.js';
import { ExtractError, extractError } from '../errors.js';
import { KreuzbergConcurrencyLimiter } from '../kreuzberg-concurrency.limiter.js';

const EXTRACT_TIMEOUT_MS = 120_000;
const HEALTH_TIMEOUT_MS = 5_000;
const RESPONSE_FRAGMENT_MAX = 500;

export type KreuzbergHealthStatus = {
    readonly status: 'up' | 'down';
    readonly version?: string;
    readonly error?: string;
};

const responseFragment = (text: string): string =>
    text.length <= RESPONSE_FRAGMENT_MAX ? text : `${text.slice(0, RESPONSE_FRAGMENT_MAX)}…`;

const readTextField = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const readRecordField = (value: unknown): Record<string, unknown> | undefined =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;

/**
 * Разбирает типичные формы ответа kreuzberg REST API.
 * Официальный контракт POST /extract: JSON-массив `[{ content, mime_type, metadata, tables, … }]`.
 */
export function parseKreuzbergExtractBody(
    body: unknown,
): { markdown: string; meta?: Record<string, unknown> } | null {
    if (typeof body === 'string') {
        const markdown = readTextField(body);
        return markdown ? { markdown } : null;
    }

    if (!body || typeof body !== 'object') {
        return null;
    }

    const record = body as Record<string, unknown>;

    const errorMessage = readTextField(record.message);
    if (readTextField(record.error_type) && errorMessage) {
        return null;
    }

    const directMarkdown =
        readTextField(record.markdown) ?? readTextField(record.content) ?? readTextField(record.text);
    if (directMarkdown) {
        const meta = readRecordField(record.metadata) ?? readRecordField(record.meta);
        return { markdown: directMarkdown, meta };
    }

    const results = record.results;
    if (Array.isArray(results) && results.length > 0) {
        const first = results[0];
        if (first && typeof first === 'object') {
            const item = first as Record<string, unknown>;
            const markdown =
                readTextField(item.markdown) ?? readTextField(item.content) ?? readTextField(item.text);
            if (markdown) {
                const meta = readRecordField(item.metadata) ?? readRecordField(item.meta);
                return { markdown, meta };
            }
        }
    }

    if (Array.isArray(body) && body.length > 0) {
        return parseKreuzbergExtractBody(body[0]);
    }

    return null;
}

/** HTTP-адаптер kreuzberg: multipart POST /extract → markdown (single-step extract). */
@Injectable()
export class KreuzbergHttpExtractor {
    constructor(
        private readonly config: AppConfigService,
        private readonly limiter: KreuzbergConcurrencyLimiter,
    ) {}

    extract(file: FileModel, filePath: string): Effect.Effect<PreparedResult, ExtractError> {
        // Без предварительного health-check: при недоступности kreuzberg сам POST /extract вернёт
        // ошибку транспорта, которую мы маппим в ExtractError. Лишний round-trip на каждый документ
        // не нужен. Здоровье сервиса отдельно отдаёт health.controller через checkHealth().
        return this.limiter.withPermit(
            Effect.tryPromise({
                try: () => this.postExtract(filePath),
                catch: (error) =>
                    error instanceof ExtractError
                        ? error
                        : extractError(`HTTP kreuzberg /extract: ${formatUnknown(error)}`),
            }),
        );
    }

    /** Быстрая проверка GET /health (fallback: GET /version). Используется health.controller. */
    async checkHealth(): Promise<KreuzbergHealthStatus> {
        const base = this.config.kreuzbergUrl.replace(/\/$/, '');

        for (const endpoint of ['/health', '/version'] as const) {
            try {
                const response = await fetch(`${base}${endpoint}`, {
                    signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
                });
                if (!response.ok) {
                    continue;
                }

                const body: unknown = await response.json().catch(() => null);
                if (endpoint === '/health' && body && typeof body === 'object') {
                    const record = body as Record<string, unknown>;
                    const version = readTextField(record.version);
                    if (record.status === 'healthy') {
                        return { status: 'up', version };
                    }
                    if (version) {
                        return { status: 'up', version };
                    }
                }

                if (endpoint === '/version' && body && typeof body === 'object') {
                    const version = readTextField((body as Record<string, unknown>).version);
                    if (version) {
                        return { status: 'up', version };
                    }
                }

                return { status: 'up' };
            } catch {
                // пробуем следующий endpoint
            }
        }

        return { status: 'down', error: 'нет ответа от /health и /version' };
    }

    private async postExtract(filePath: string): Promise<PreparedResult> {
        const bytes = await readFile(filePath);
        const fileName = path.basename(filePath);

        const form = new FormData();
        form.append('files', new Blob([bytes]), fileName);
        form.append('output_format', 'markdown');

        const url = `${this.config.kreuzbergUrl.replace(/\/$/, '')}/extract`;
        const response = await fetch(url, {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
        });

        const rawText = await response.text();
        let parsed: unknown;
        try {
            parsed = rawText.length > 0 ? JSON.parse(rawText) : null;
        } catch {
            parsed = rawText;
        }

        if (!response.ok) {
            const apiMessage =
                parsed && typeof parsed === 'object' && 'message' in parsed
                    ? readTextField((parsed as Record<string, unknown>).message)
                    : undefined;
            throw extractError(
                apiMessage
                    ? `kreuzberg HTTP ${response.status}: ${apiMessage}`
                    : `kreuzberg HTTP ${response.status}: ${responseFragment(rawText)}`,
            );
        }

        const extracted = parseKreuzbergExtractBody(parsed);
        if (!extracted) {
            throw extractError(
                `Не удалось извлечь markdown из ответа kreuzberg: ${responseFragment(rawText)}`,
            );
        }

        const meta: Record<string, unknown> = {
            ...extracted.meta,
            source: 'kreuzberg',
            outputFormat: 'markdown',
        };

        if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === 'object') {
            const item = parsed[0] as Record<string, unknown>;
            if (item.mime_type !== undefined) meta.mimeType = item.mime_type;
            if (item.metadata !== undefined) meta.kreuzbergMetadata = item.metadata;
            if (item.tables !== undefined) meta.tables = item.tables;
        }

        return {
            markdown: extracted.markdown,
            meta,
        };
    }
}
