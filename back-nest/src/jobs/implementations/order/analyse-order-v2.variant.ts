import type { AnalysisVariant } from '@miracle/types';

/**
 * Дескриптор варианта анализа v2 (групповой пошаговый анализ) — лежит рядом с джобой
 * `analyse-order-v2`. Чистые метаданные + схема параметров; запуск разводит
 * `OrderAnalysisVariantsService`. Подробности алгоритма — в README этой папки.
 */
export const ANALYSE_ORDER_V2_VARIANT: AnalysisVariant = {
    id: 'analyse-order-v2',
    name: 'Групповой пошаговый анализ (v2)',
    description:
        'Однотипная продукция группируется по ТУ и анализируется пошагово по слотам. Дешевле по токенам и точнее, но медленнее.',
    params: [
        {
            key: 'deleteJobs',
            label: 'Перезапустить анализ',
            description:
                'Снести прежний прогон и запустить заново. Без флага — вернуть текущий, если он уже есть.',
            type: 'boolean',
            default: true,
        },
        {
            key: 'forcePositions',
            label: 'Переизвлечь позиции',
            description:
                'Извлечь позиции из приложений заново (стоит токенов). Без флага — переиспользовать уже извлечённые.',
            type: 'boolean',
            default: false,
        },
        {
            key: 'deleteFileContent',
            label: 'Очистить вычитки файлов',
            description: 'Дополнительно удалить промежуточные извлечения из файлов (FileContent).',
            type: 'boolean',
            default: false,
        },
    ],
};
