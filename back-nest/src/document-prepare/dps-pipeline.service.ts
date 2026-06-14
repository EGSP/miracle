import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { readFile } from 'fs/promises';
import path from 'path';
import { Cause, Effect } from 'effect';
import { formatUnknown } from '../common/effect-errors.js';
import { AppConfigService } from '../config/app-config.service.js';
import { AppLoggerService, type AppLogger } from '../logger/app-logger.service.js';
import { FilesService } from '../files/files.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { KreuzbergHttpExtractor } from './adapters/kreuzberg-http.extractor.js';
import { LibreOfficeHttpConverter } from './adapters/libreoffice-http.converter.js';
import { ExtractError, extractError } from './errors.js';
import { Lane } from './lane.js';
import { PreparedDocumentStore } from './prepared-document.store.js';
import { routePreparedEngine, VISION_PREPARE_JOB_ID } from './router.js';

/** Вход линии Kreuzberg: id файла + путь + флаг временного файла (его удаляем после извлечения). */
type KreuzbergItem = { readonly fileId: string; readonly filePath: string; readonly isTemp: boolean };
/** Вход линии LibreOffice: id файла + путь к исходному .doc. */
type LibreOfficeItem = { readonly fileId: string; readonly filePath: string };
/** Вход линии Yandex (LLM Vision): id файла. */
type YandexItem = { readonly fileId: string };

const causeMessage = (cause: Cause.Cause<unknown>): string => {
    const error = Cause.squash(cause);
    return error instanceof ExtractError ? error.message : formatUnknown(error);
};

/**
 * Движок обработки DPS — in-memory пайплайн с обратной связью (backpressure) поверх durable-очереди
 * запросов в БД (`PreparedDocument.status`). Это фундамент DPS: не джоба зовёт пайплайн, а пайплайн
 * сам обрабатывает запрос и пишет состояние в `PreparedDocument`.
 *
 * Линии (`Lane`) per-backend, расцеплены через bounded-очереди (полная очередь следующей стадии
 * тормозит предыдущую — backpressure без знания одной стадии о другой):
 * - `.doc` → LibreOffice (конвертация в `.docx` во временный файл) → Kreuzberg;
 * - не-визуальные → сразу Kreuzberg;
 * - визуальные → Yandex (LLM Vision): линия запускает durable-джобу как свой этап — долгая
 *   асинхронная операция, состояние надо пережить рестарт. Реальный вызов LLM гейтится флагом
 *   `LLM_VISION_ENABLED` (по умолчанию выкл → vision-джоба помечает запрос ошибкой).
 *
 * Kreuzberg/LibreOffice — синхронные «в моменте», джоба им не нужна: терминальная стадия пишет
 * `PreparedDocument` (succeed/failed) напрямую.
 */
@Injectable()
export class DpsPipeline implements OnModuleInit {
    private readonly libreofficeLane = new Lane<LibreOfficeItem>('libreoffice');
    private readonly kreuzbergLane = new Lane<KreuzbergItem>('kreuzberg');
    private readonly yandexLane = new Lane<YandexItem>('yandex');

    private readonly logger: AppLogger;

    constructor(
        private readonly config: AppConfigService,
        private readonly store: PreparedDocumentStore,
        private readonly files: FilesService,
        private readonly converter: LibreOfficeHttpConverter,
        private readonly kreuzberg: KreuzbergHttpExtractor,
        private readonly jobs: JobsService,
        @Inject(AppLoggerService) loggerFactory: AppLoggerService,
    ) {
        this.logger = loggerFactory.forContext(DpsPipeline.name);
    }

    /** Непредвиденный исход обработчика линии (ошибка/дефект): логируем, воркер продолжает (см. {@link Lane}). */
    private readonly onLaneError = (label: string, cause: Cause.Cause<unknown>): void => {
        this.logger.error(`Линия "${label}": ошибка обработки элемента`, Cause.pretty(cause));
    };

    onModuleInit(): void {
        const kreuzbergWorkers = this.config.dpsMaxConcurrency;
        const libreofficeWorkers = this.config.libreofficeConvertMaxConcurrency;

        // Глубина очереди = небольшой буфер сверх числа воркеров: задаёт «фору» и потолок ожидания.
        this.kreuzbergLane.init(Math.max(kreuzbergWorkers * 2, 4));
        this.libreofficeLane.init(Math.max(libreofficeWorkers * 2, 2));
        this.yandexLane.init(4);

        this.kreuzbergLane.startWorkers(kreuzbergWorkers, this.handleKreuzberg, this.onLaneError);
        this.libreofficeLane.startWorkers(libreofficeWorkers, this.handleLibreOffice, this.onLaneError);
        this.yandexLane.startWorkers(1, this.handleYandex, this.onLaneError);
    }

    /**
     * Точка входа движка: маршрутизирует файл в нужную линию. Помечает `running` и кладёт заказ в
     * очередь линии (offer suspend-ится — backpressure — если очередь полна). Дальнейшие статусы
     * (`succeed`/`failed`) пишет терминальная стадия линии (для Yandex — vision-джоба).
     */
    submit(fileId: string): Effect.Effect<void> {
        return Effect.gen(this, function* () {
            const file = yield* Effect.promise(() => this.files.get(fileId));
            if (!file) {
                yield* this.store.markFailed(fileId, 'Файл не найден');
                return;
            }

            const engine = routePreparedEngine(file);
            yield* this.store.markRunning(fileId);

            if (engine === 'llm-vision') {
                yield* this.yandexLane.offer({ fileId });
                return;
            }

            const filePath = this.files.getFilePath(file);
            if (path.extname(filePath).toLowerCase() === '.doc') {
                yield* this.libreofficeLane.offer({ fileId, filePath });
                return;
            }
            yield* this.kreuzbergLane.offer({ fileId, filePath, isTemp: false });
        });
    }

    // ── Обработчики линий (никогда не падают: исход пишется в PreparedDocument) ───────────────

    /** Терминальная стадия: извлечение через Kreuzberg → запись результата; чистка временного файла. */
    private readonly handleKreuzberg = (item: KreuzbergItem): Effect.Effect<unknown, never> => {
        const work = this.kreuzberg.runExtract(item.filePath);
        const guarded = item.isTemp
            ? work.pipe(Effect.ensuring(this.files.removeTemp(item.filePath)))
            : work;
        return guarded.pipe(
            Effect.matchCauseEffect({
                onFailure: (cause) => this.store.markFailed(item.fileId, causeMessage(cause)),
                onSuccess: (result) => this.store.markSucceeded(item.fileId, result),
            }),
        );
    };

    /** Стадия конвертации: .doc → временный .docx, передача заказа в линию Kreuzberg (того же файла). */
    private readonly handleLibreOffice = (item: LibreOfficeItem): Effect.Effect<unknown, never> =>
        this.convertToTempDocx(item.filePath).pipe(
            Effect.matchCauseEffect({
                onFailure: (cause) => this.store.markFailed(item.fileId, causeMessage(cause)),
                onSuccess: (tempPath) =>
                    this.kreuzbergLane.offer({ fileId: item.fileId, filePath: tempPath, isTemp: true }),
            }),
        );

    /**
     * Стадия Yandex: запускает durable vision-джобу (`prepare-vision`) — она делает LLM-разметку в
     * markdown и пишет `PreparedDocument`. Durable, потому что операция долгая (submit → poll) и
     * состояние надо пережить рестарт. Реальный вызов LLM гейтится `LLM_VISION_ENABLED` внутри джобы.
     * Идемпотентность джобы — по ключу `[prepare-vision, fileId]`.
     */
    private readonly handleYandex = (item: YandexItem): Effect.Effect<unknown, never> =>
        Effect.gen(this, function* () {
            const key = [VISION_PREPARE_JOB_ID, item.fileId] as const;
            // Завершённый прежний прогон сносим — re-prepare должен извлекать заново (как старый enqueue).
            // running/queued не трогаем: jobs.start вернёт его как есть (идемпотентность, в т.ч. reconcile).
            const existing = yield* Effect.promise(() => this.jobs.findByKey([...key]));
            if (existing && existing.status !== 'running' && existing.status !== 'queued') {
                yield* Effect.promise(() => this.jobs.deleteRunTree(existing.id));
            }
            yield* Effect.promise(() =>
                this.jobs.start(VISION_PREPARE_JOB_ID, { fileId: item.fileId }, [...key]),
            );
        }).pipe(
            Effect.matchCauseEffect({
                onFailure: (cause) => this.store.markFailed(item.fileId, causeMessage(cause)),
                onSuccess: () => Effect.void,
            }),
        );

    private convertToTempDocx(filePath: string): Effect.Effect<string, ExtractError> {
        return Effect.gen(this, function* () {
            const bytes = yield* Effect.tryPromise({
                try: () => readFile(filePath),
                catch: (error) => extractError(`Чтение файла: ${formatUnknown(error)}`),
            });
            const docx = yield* this.converter
                .convert(bytes, path.basename(filePath))
                .pipe(Effect.mapError((error) => extractError(error.message)));
            return yield* this.files.writeTemp(docx, 'docx').pipe(
                Effect.mapError((error) => extractError(`Запись временного .docx: ${formatUnknown(error)}`)),
            );
        });
    }
}
