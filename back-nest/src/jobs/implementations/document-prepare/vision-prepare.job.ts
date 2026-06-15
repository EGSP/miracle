import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { brandJobId, type Job } from '../../framework/job.js';
import { JobImpl } from '../../framework/job-impl.decorator.js';
import { JobTools } from '../../framework/context.js';
import { formatUnknown } from '../../../common/effect-errors.js';
import { withTokensUsageScope } from '../../../common/tokens-usage.js';
import { AppConfigService } from '../../../config/app-config.service.js';
import { ExtractError } from '../../../document-prepare/errors.js';
import { PreparedDocumentStore } from '../../../document-prepare/prepared-document.store.js';
import { VISION_PREPARE_JOB_ID } from '../../../document-prepare/router.js';
import { VisionExtractTool } from './tools/vision-extract.tool.js';

export type VisionPrepareInput = { fileId: string };

const formatJobError = (error: unknown): string =>
    error instanceof ExtractError ? error.message : formatUnknown(error);

/**
 * Durable-джоба LLM Vision-разметки. Запускается линией Yandex ({@link DpsPipeline}) как её этап:
 * операция долгая (submit → poll к Yandex), поэтому нужен durable-прогон с checkpoint `opId`
 * (его держит {@link VisionExtractTool} в ToolMemo — при рестарте джоба продолжает polling, а не
 * шлёт vision повторно).
 *
 * БЛОК: реальная разметка идёт только при `LLM_VISION_ENABLED=true`. По умолчанию (выкл) запрос
 * помечается ошибкой — VISUAL не размечается автоматически. Линия и джоба при этом полностью
 * проводятся; чтобы включить — флаг.
 */
@Injectable()
@JobImpl()
export class VisionPrepareJob implements Job<VisionPrepareInput, void> {
    readonly id = brandJobId(VISION_PREPARE_JOB_ID);
    run!: Job<VisionPrepareInput, void>['run'];

    constructor(
        config: AppConfigService,
        store: PreparedDocumentStore,
        visionExtractTool: VisionExtractTool,
    ) {
        this.run = (input) =>
            Effect.gen(function* () {
                // Ручной запрос (allowVision на PreparedDocument) разрешает разметку в обход глобального
                // флага. БЛОК действует только для авто-пути при выключенном LLM_VISION_ENABLED.
                const allowVision = yield* store.loadAllowVision(input.fileId);
                if (!config.llmVisionEnabled && !allowVision) {
                    // catchAll пометит PreparedDocument failed, а прогон станет failed (повторный
                    // re-prepare — в т.ч. ручной с allowVision — сможет перезапустить).
                    return yield* Effect.fail(
                        new ExtractError({
                            message:
                                'LLM Vision разметка отключена (LLM_VISION_ENABLED=false). Запустите ручной анализ файла.',
                        }),
                    );
                }

                const tools = yield* JobTools;
                yield* store.markRunning(input.fileId);
                const result = yield* tools.run(visionExtractTool, { fileId: input.fileId });
                yield* store.markSucceeded(input.fileId, result);
            }).pipe(
                Effect.catchAll((error) =>
                    Effect.gen(function* () {
                        const message = formatJobError(error);
                        yield* store.markFailed(input.fileId, message);
                        return yield* Effect.fail(error instanceof Error ? error : new Error(message));
                    }),
                ),
                // Корень разметки кладёт fileId в ambient-теги — vision-вызов Yandex попадёт в ledger
                // расхода токенов с атрибуцией по файлу (симметрично orderId в анализе заказа).
                withTokensUsageScope({ fileId: input.fileId }),
            );
    }
}
