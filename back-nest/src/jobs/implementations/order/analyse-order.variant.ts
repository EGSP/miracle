import type { AnalysisVariant } from '@miracle/types';

/**
 * Дескриптор варианта анализа v1 (полный изолированный анализ позиций) — лежит рядом с джобой
 * `analyse-order`. Чистые метаданные + схема параметров; запуск разводит `OrderAnalysisVariantsService`.
 */
export const ANALYSE_ORDER_VARIANT: AnalysisVariant = {
    id: 'analyse-order',
    name: 'Полный анализ позиций (v1)',
    description:
        'Каждая позиция анализируется изолированно по всему условному обозначению. Параллельно, но дороже по токенам.',
    params: [
        {
            key: 'deleteJobs',
            label: 'Перезапустить анализ',
            description:
                'Снести прежний прогон и запустить заново. Без флага — вернуть текущий, если он уже есть.',
            type: 'boolean',
            default: false,
        },
    ],
};
