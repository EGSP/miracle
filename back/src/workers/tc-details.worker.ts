import { randomUUID } from 'crypto';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ExtractionStatus, WorkerStatus } from '@miracle/types';
import type { Stored, TCDetailsWorkerData, TechnicalConditionRule } from '@miracle/types';
import { filesContentService } from '../databases/file-content.db.js';
import { technicalConditionsService } from '../databases/technical-condition.db.js';
import { workersService } from '../databases/workers.db.js';
import { yandexLlm } from '../lib/yandex/yandex-llm.js';
import { countTokens } from '../lib/tokens/tokens.js';
import { logger } from '../logger/logger.js';
import { BaseWorker } from './base-worker.js';

const POLL_INTERVAL_MS = 3_000;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Zod-схема ответа LLM ─────────────────────────────────────────────────

const TCDetailsZodSchema = z.object({
    sections: z
        .array(
            z.object({
                index: z.number()
                    .describe('Порядковый номер раздела в тексте (0-based)'),
                title: z.string()
                    .describe(
                        'Краткое смысловое резюме раздела в 5–10 слов — сформулируй сам, о чём этот раздел. '
                        + 'Не копируй первую строку дословно. '
                        + 'Пустая строка только если раздел не имеет смысловой темы.',
                    ),
                content: z.string()
                    .describe(
                        'Полный текст раздела дословно. '
                        + 'Таблицы — в markdown-формате с разделителем и всеми строками данных. '
                        + 'Переносы строк — символ \\n.',
                    ),
            }),
        )
        .describe('Все разделы документа ТУ в порядке появления в тексте'),
});

type TCDetailsResult = z.infer<typeof TCDetailsZodSchema>;
const TCDetailsJsonSchema = zodToJsonSchema(TCDetailsZodSchema);

// ─── Промпт ───────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Ты разбиваешь текст Технического Условия (ТУ) на структурированные разделы для последующей работы с ними.

Идёшь по тексту сверху вниз и для каждой смысловой единицы создаёшь один элемент в массиве sections.

Что считается отдельным разделом:
- нумерованный пункт или подпункт
- ненумерованный абзац, представляющий самостоятельную мысль
- таблица (классификация, параметры, размеры, варианты исполнения и т.п.)
- примечание, сноска или ссылка на нормативный документ
- пример условного обозначения с расшифровкой

Как заполнять поля:
- index — порядковый номер по тексту, начиная с 0
- title — твоя формулировка темы раздела в 5–10 слов; не первая строка дословно. Пустая строка допустима, если у раздела нет внятной темы (например, обособленная таблица без заголовка).
- content — текст раздела дословно, без перефразирования; переносы строк — \\n.

Особое внимание таблицам:
- оформляй таблицу как markdown с шапкой и строкой-разделителем |---|
- переноси ВСЕ строки данных, ничего не сокращай и не пропускай
- если у таблицы есть подпись или номер ("Таблица 1 — …"), включай её в content перед таблицей
- если таблица разорвана разрывом страницы или повторяющейся шапкой — собирай её обратно в одну, в один раздел
- объединённые ячейки разворачивай, дублируя значение в каждую строку, к которой оно относится

Если сомневаешься, где граница между двумя смысловыми блоками, лучше создай два раздела, чем один объединённый.`;

// ─── Воркер ───────────────────────────────────────────────────────────────

export type TCDetailsWorkerOptions =
    | { data: null; tcId: string }
    | { data: Stored<TCDetailsWorkerData> };

export class TCDetailsWorker extends BaseWorker {
    readonly type = 'tc-details-worker' as const;

    private data: Partial<Stored<TCDetailsWorkerData>>;

    constructor(options: TCDetailsWorkerOptions) {
        super();
        if (options.data === null) {
            this.data = {
                type: this.type,
                tcId: options.tcId,
            };
        } else {
            this.data = { ...options.data };
        }
    }

    async mount(): Promise<void> {
        if (!this.data.tcId) {
            throw new Error('Воркер не получил идентификатор TC');
        }

        if (!this.data.id) {
            const created = await workersService.create({
                type: this.type,
                status: WorkerStatus.Active,
                tcId: this.data.tcId,
            } satisfies TCDetailsWorkerData);

            this.data = created as Stored<TCDetailsWorkerData>;
            return;
        }

        const updated = await workersService.update(this.data.id, {
            status: WorkerStatus.Active,
            cloudOperationId: this.data.cloudOperationId,
        });
        this.data = updated as Stored<TCDetailsWorkerData>;
    }

    async run(): Promise<void> {
        try {
            if (!this.data.id) {
                throw new Error('Воркер не инициализирован: ожидается вызов mount() перед run()');
            }

            if (!this.data.cloudOperationId) {
                const text = await this.getTcText();
                const prompt = `${SYSTEM_PROMPT}\n\n${text}`;

                const cloudOperationId = await yandexLlm.submitCompletion({
                    messages: [
                        { role: 'system', text: SYSTEM_PROMPT },
                        { role: 'user', text },
                    ],
                    temperature: 0.1,
                    maxTokens: countTokens(prompt) * 10,
                    jsonSchema: TCDetailsJsonSchema,
                });

                this.data.cloudOperationId = cloudOperationId;
                const updated = await workersService.update(this.data.id, { cloudOperationId });
                this.data = updated as Stored<TCDetailsWorkerData>;
            }

            while (!this.shouldStop) {
                const poll = await yandexLlm.pollCompletionJson(
                    this.data.cloudOperationId!,
                    TCDetailsZodSchema,
                );

                if (poll.done) {
                    const operationResult = JSON.stringify(poll.result);
                    const updated = await workersService.update(this.data.id!, { operationResult });
                    this.data = updated as Stored<TCDetailsWorkerData>;
                    await this.markSuccess();
                    return;
                }

                await sleep(POLL_INTERVAL_MS);
            }

            await this.markStopped();
        } catch (error) {
            const message = TCDetailsWorker.extractErrorMessage(error);
            logger.error(`[TCDetailsWorker] run(): ${message}`);

            if (this.data.id) {
                const updated = await workersService.update(this.data.id, {
                    status: WorkerStatus.Failed,
                    errorMessage: message,
                });
                this.data = updated as Stored<TCDetailsWorkerData>;
            }
        }
    }

    getWorkerRecordId(): string | undefined {
        return this.data.id;
    }

    async apply(): Promise<void> {
        if (!this.data.id) throw new Error('Воркер не инициализирован');
        if (!this.data.tcId) throw new Error('Воркер не получил идентификатор TC');
        if (!this.data.operationResult) throw new Error('Воркер не содержит результат операции');

        const parsed: TCDetailsResult = TCDetailsZodSchema.parse(
            JSON.parse(this.data.operationResult),
        );

        // Сортируем разделы по index из ответа LLM, затем генерируем id
        // index используется только как временный ключ в LLM-ответе — в хранилище не сохраняется
        const sortedRawRules = [...parsed.sections].sort((a, b) => a.index - b.index);

        const rules: TechnicalConditionRule[] = sortedRawRules.map((r) => ({
            id: randomUUID(),
            // Yandex JSON Schema не поддерживает optional-поля — LLM возвращает пустую строку
            // вместо отсутствующего заголовка, нормализуем обратно в undefined
            title: r.title || undefined,
            content: r.content,
        }));

        const tc = await technicalConditionsService.getById(this.data.tcId);
        if (!tc) throw new Error(`TC "${this.data.tcId}" не найдено`);

        await technicalConditionsService.replace(this.data.tcId, {
            name: tc.name,
            fileId: tc.fileId,
            productTypeId: tc.productTypeId,
            lastProductTypeName: tc.lastProductTypeName,
            rules,
            designationSlots: tc.designationSlots ?? [],
            displayTemplates: tc.displayTemplates ?? [],
        });

        logger.info(
            `[TCDetailsWorker] TC "${this.data.tcId}" обновлён: ${rules.length} правил`,
        );
    }

    // ─── Приватные методы ────────────────────────────────────────────────

    private async getTcText(): Promise<string> {
        if (!this.data.tcId) {
            throw new Error('Воркер не получил идентификатор TC');
        }

        const tc = await technicalConditionsService.getById(this.data.tcId);
        if (!tc) {
            throw new Error(`TC "${this.data.tcId}" не найдено`);
        }
        if (!tc.fileId) {
            throw new Error(`У TC "${this.data.tcId}" не прикреплён PDF-файл`);
        }

        const contents = await filesContentService.getContent(tc.fileId);
        const completed = contents.find(
            (c) => c.meta?.extractionStatus === ExtractionStatus.COMPLETED,
        );

        if (!completed) {
            throw new Error(
                `Файл "${tc.fileId}" не имеет завершённого извлечения содержимого. `
                + 'Сначала дождитесь завершения OCR/LLM-Vision обработки файла.',
            );
        }

        const text = (completed.content ?? [])
            .map((page) => page.text ?? '')
            .filter(Boolean)
            .join('\n\n');

        if (!text) {
            throw new Error(`Файл "${tc.fileId}" не содержит извлечённого текста`);
        }

        return text;
    }

    private async markSuccess(): Promise<void> {
        if (!this.data.id) return;
        const updated = await workersService.update(this.data.id, { status: WorkerStatus.Success });
        this.data = updated as Stored<TCDetailsWorkerData>;
    }

    private async markStopped(): Promise<void> {
        if (!this.data.id) return;
        const updated = await workersService.update(this.data.id, { status: WorkerStatus.Stopped });
        this.data = updated as Stored<TCDetailsWorkerData>;
    }
}
