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
import { dedupeMarkdownTableCells } from '../markdown-table-dedupe.js';
import { LibreOfficeHttpConverter } from './libreoffice-http.converter.js';

const EXTRACT_TIMEOUT_MS = 120_000;
const HEALTH_TIMEOUT_MS = 5_000;
const RESPONSE_FRAGMENT_MAX = 500;

/**
 * Конфиг извлечения, отправляемый в поле `config` (JSON) формы POST /extract.
 *
 * Профиль: офисные документы (DOCX/XLSX/PPTX) с нативным текстовым слоем —
 * НЕ сканы и НЕ визуальные PDF. Воспроизводит набор питон-прототипа, который
 * давал качественный markdown без дублирования объединённых ячеек (в отличие от docling):
 * дублирование merged-cells — артефакт OCR/VLM/layout-пути, поэтому выбираем нативное извлечение.
 *
 * Без этого поля Kreuzberg работает на дефолтах по всему, кроме `output_format`.
 */
const KREUZBERG_EXTRACT_CONFIG = {
    /** Кэш результата по контенту файла — повторный extract того же документа бесплатный. */
    use_cache: true,
    /** Постобработка качества markdown (нормализация пробелов, структуры, артефактов). */
    enable_quality_processing: true,
    /** Не форсировать OCR: офисные доки уже содержат текст, OCR только портит и тормозит. */
    force_ocr: false,
    /** Полностью отключить OCR-путь для не-визуальных форматов — нативное извлечение. */
    disable_ocr: true,
    /** Сохранять структуру документа (заголовки, списки, таблицы) при конвертации в markdown. */
    include_document_structure: true,
    /** Формат результата (дублирует form-поле output_format для совместимости версий). */
    output_format: 'markdown',
} as const;

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
        private readonly docxConverter: LibreOfficeHttpConverter,
    ) {}

    extract(file: FileModel, filePath: string): Effect.Effect<PreparedResult, ExtractError> {
        // Без предварительного health-check: при недоступности kreuzberg сам POST /extract вернёт
        // ошибку транспорта, которую мы маппим в ExtractError. Лишний round-trip на каждый документ
        // не нужен. Здоровье сервиса отдельно отдаёт health.controller через checkHealth().
        return this.limiter.withPermit(
            Effect.gen(this, function* () {
                const input = yield* this.loadInput(filePath);
                return yield* Effect.tryPromise({
                    try: () => this.postExtract(input.bytes, input.fileName),
                    catch: (error) =>
                        error instanceof ExtractError
                            ? error
                            : extractError(`HTTP kreuzberg /extract: ${formatUnknown(error)}`),
                });
            }),
        );
    }

    /**
     * Читает файл и, для legacy `.doc`, конвертирует его в `.docx` (Kreuzberg извлекает `.doc` битым:
     * кириллица → CJK, обрыв текста, потеря таблиц). {@link ConvertError} маппится в {@link ExtractError}.
     */
    private loadInput(
        filePath: string,
    ): Effect.Effect<{ bytes: Uint8Array<ArrayBuffer>; fileName: string }, ExtractError> {
        return Effect.gen(this, function* () {
            const bytes = yield* Effect.tryPromise({
                try: () => readFile(filePath),
                catch: (error) => extractError(`Чтение файла: ${formatUnknown(error)}`),
            });
            const fileName = path.basename(filePath);

            if (path.extname(filePath).toLowerCase() !== '.doc') {
                return { bytes, fileName };
            }

            const docx = yield* this.docxConverter
                .convert(bytes, fileName)
                .pipe(Effect.mapError((error) => extractError(error.message)));
            return { bytes: docx, fileName: fileName.replace(/\.doc$/i, '.docx') };
        });
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

    private async postExtract(
        bytes: Uint8Array<ArrayBuffer>,
        fileName: string,
    ): Promise<PreparedResult> {
        const form = new FormData();
        form.append('files', new Blob([bytes]), fileName);
        form.append('output_format', 'markdown');
        form.append('config', JSON.stringify(KREUZBERG_EXTRACT_CONFIG));

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

        // Постпроцесс: гасим горизонтальные дубли ячеек в таблицах. Если дедуп что-то изменил —
        // сохраняем исходный markdown Kreuzberg (для сравнения) и размеченный вариант (для подсветки
        // мест дедупа в предпросмотре). Если изменений нет — meta не раздуваем.
        const deduped = dedupeMarkdownTableCells(extracted.markdown);
        let markdown = extracted.markdown;
        if (deduped.spots.length > 0) {
            markdown = deduped.markdown;
            meta.nativeMarkdown = extracted.markdown;
            meta.dedup = {
                count: deduped.spots.length,
                spots: deduped.spots,
                markedMarkdown: deduped.marked,
            };
        }

        return {
            markdown,
            meta,
        };
    }
}
