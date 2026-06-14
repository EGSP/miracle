import { z } from 'zod';

export const CreateTextApplicationSchema = z.object({
    text: z.string().trim().min(1, 'Текст приложения не может быть пустым'),
});

/**
 * Параметры запроса (пере)анализа заказа.
 * - `deleteJobs` (умолч. true): снести прежнее дерево прогонов `analyse-order` и запустить заново;
 *   при `false` — если анализ уже есть, вернуть его без перезапуска.
 * - `deleteFileContent` (умолч. false): дополнительно удалить вычитки FileContent файловых приложений.
 * Позиции и обозначения заказа стираются перед перезапуском всегда.
 */
export const AnalyseOrderSchema = z.object({
    deleteJobs: z.boolean().default(true),
    deleteFileContent: z.boolean().default(false),
});

export type AnalyseOrderOptions = z.infer<typeof AnalyseOrderSchema>;

/**
 * Тело унифицированного запуска анализа: выбранный вариант + значения булевых параметров.
 * Параметры свободной формы (`Record<string, boolean>`) валидируются по схеме конкретного варианта
 * на сервере (`OrderAnalysisVariantsService`).
 */
export const AnalyseOrderRequestSchema = z.object({
    variantId: z.string().min(1, 'Не передан id варианта анализа'),
    params: z.record(z.string(), z.boolean()).default({}),
});

export type AnalyseOrderRequestInput = z.infer<typeof AnalyseOrderRequestSchema>;
