import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
    FileDomain,
    getFileDomain,
    type AnalysisBlocker,
    type AnalysisParamDef,
    type AnalysisReadiness,
    type AnalysisVariant,
    type AnalysisVariantInfo,
    type JobRun,
} from '@miracle/types';
import { ANALYSE_ORDER_VARIANT } from '../jobs/implementations/order/analyse-order.variant.js';
import { ANALYSE_ORDER_V2_VARIANT } from '../jobs/implementations/order/analyse-order-v2.variant.js';
import { DocumentPrepareService } from '../document-prepare/document-prepare.service.js';
import { FilesService } from '../files/files.service.js';
import { OrderAnalysisService } from './order-analysis.service.js';
import { OrderApplicationsService } from './order-applications.service.js';

const ACTIVE_STATUSES = new Set(['queued', 'running']);
const ANALYSE_ORDER_V2_ID = ANALYSE_ORDER_V2_VARIANT.id;

/** Сводит свободные параметры запроса к схеме варианта: неизвестные ключи игнорирует, пустые — дефолт. */
function resolveParams(
    defs: AnalysisParamDef[],
    params: Record<string, boolean>,
): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const def of defs) {
        const value = params[def.key];
        out[def.key] = typeof value === 'boolean' ? value : def.default;
    }
    return out;
}

/**
 * Реестр вариантов анализа заказа — аналог `OrderReportService` для отчётов. Держит дескрипторы
 * вариантов (метаданные + схема параметров лежат рядом с джобами), разводит запуск по триггерам
 * {@link OrderAnalysisService} и считает готовность заказа к запуску ({@link readiness}).
 */
@Injectable()
export class OrderAnalysisVariantsService {
    private readonly variants: AnalysisVariant[] = [ANALYSE_ORDER_VARIANT, ANALYSE_ORDER_V2_VARIANT];

    constructor(
        private readonly orderAnalysis: OrderAnalysisService,
        private readonly applications: OrderApplicationsService,
        private readonly files: FilesService,
        private readonly documentPrepare: DocumentPrepareService,
    ) {}

    /** Список доступных вариантов (без схемы параметров) — для дропдауна. */
    listVariants(): AnalysisVariantInfo[] {
        return this.variants.map(({ id, name, description }) => ({ id, name, description }));
    }

    /** Схема параметров запуска варианта — для динамического рендера формы. */
    getParams(variantId: string): AnalysisParamDef[] {
        return this.requireVariant(variantId).params;
    }

    /**
     * Запуск анализа выбранным вариантом. Сначала проверяет готовность (нет активного прогона,
     * VISUAL-приложения подготовлены) — иначе `409`. Затем сводит параметры к схеме варианта и
     * разводит на нужный триггер.
     */
    async run(orderId: string, variantId: string, params: Record<string, boolean>): Promise<JobRun> {
        const variant = this.requireVariant(variantId);

        const readiness = await this.readiness(orderId, variantId);
        if (!readiness.canRun) {
            throw new ConflictException(readiness.blockers.map((blocker) => blocker.message).join('; '));
        }

        const resolved = resolveParams(variant.params, params);
        const options = {
            deleteJobs: resolved.deleteJobs ?? true,
            deleteFileContent: resolved.deleteFileContent ?? false,
        };

        if (variantId === ANALYSE_ORDER_V2_ID) {
            return this.orderAnalysis.analyseV2(orderId, options, resolved.forcePositions ?? false);
        }
        return this.orderAnalysis.analyse(orderId, options);
    }

    /**
     * Готовность заказа к запуску варианта: блокеры — активный прогон ЛЮБОГО варианта (одновременно
     * допустим только один анализ заказа) и неподготовленные VISUAL-приложения (их нужно подготовить
     * ручным запросом анализа файла).
     */
    async readiness(orderId: string, variantId: string): Promise<AnalysisReadiness> {
        this.requireVariant(variantId);
        const blockers: AnalysisBlocker[] = [];

        // Активным может быть прогон любого варианта — проверяем все, не только выбранный.
        for (const candidate of this.variants) {
            const run = await this.orderAnalysis.findRunForVariant(orderId, candidate.id);
            if (run && ACTIVE_STATUSES.has(run.status)) {
                blockers.push({
                    kind: 'active-run',
                    message: `Анализ этого заказа уже выполняется (${candidate.name}) — дождитесь завершения.`,
                });
                break;
            }
        }

        const apps = await this.applications.listByOrder(orderId);
        for (const app of apps) {
            if (app.data.type !== 'file') continue;
            const file = await this.files.get(app.data.fileId);
            if (!file) continue;
            if (getFileDomain(file.extension ?? '') !== FileDomain.VISUAL) continue;

            const prepared = await this.documentPrepare.getLatestByFile(file.id);
            if (prepared?.status === 'succeed') continue;

            blockers.push({
                kind: 'unprepared-visual',
                message: `Файл-изображение «${file.name}» не подготовлен — запустите ручной анализ файла.`,
                applicationId: app.id,
                fileId: file.id,
            });
        }

        return { canRun: blockers.length === 0, blockers };
    }

    private requireVariant(variantId: string): AnalysisVariant {
        const variant = this.variants.find((candidate) => candidate.id === variantId);
        if (!variant) {
            throw new BadRequestException(`Неизвестный вариант анализа: ${variantId}`);
        }
        return variant;
    }
}
