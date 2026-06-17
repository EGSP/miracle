/**
 * Справочник тарифов Yandex Cloud Foundation Models (₽ за 1000 токенов, вкл. НДС).
 * Источник: прайс YandexGPT / Alice AI LLM.
 */
export type LlmModelTariff = {
    /** Короткий id модели (суффикс URI `gpt://<folderId>/…`). */
    modelId: string;
    label: string;
    inputRubPer1k: number;
    outputRubPer1k: number;
};

/** Актуальные тарифы по моделям, используемым в проекте. */
export const LLM_MODEL_TARIFFS: readonly LlmModelTariff[] = [
    {
        modelId: 'yandexgpt-5.1/latest',
        label: 'YandexGPT Pro 5.1',
        inputRubPer1k: 0.41,
        outputRubPer1k: 0.41,
    },
    {
        modelId: 'yandexgpt-5-pro/latest',
        label: 'YandexGPT Pro 5',
        inputRubPer1k: 0.61,
        outputRubPer1k: 0.61,
    },
    {
        modelId: 'yandexgpt-5-lite/latest',
        label: 'YandexGPT Lite',
        inputRubPer1k: 0.1,
        outputRubPer1k: 0.1,
    },
    {
        modelId: 'alice-ai-llm/latest',
        label: 'Alice AI LLM',
        inputRubPer1k: 0.25,
        outputRubPer1k: 1.02,
    },
] as const;

/** Алиасы старых/альтернативных имён модели → ключ из {@link LLM_MODEL_TARIFFS}. */
const LLM_MODEL_TARIFF_ALIASES: Readonly<Record<string, string>> = {
    'yandexgpt/latest': 'yandexgpt-5.1/latest',
    'yandexgpt-lite/latest': 'yandexgpt-5-lite/latest',
};

const tariffByModelId = new Map(LLM_MODEL_TARIFFS.map((tariff) => [tariff.modelId, tariff]));

/** Нормализует значение `model` из ledger к короткому id (`yandexgpt-5.1/latest`). */
export function normalizeLlmModelId(model: string): string {
    return model.replace(/^gpt:\/\/[^/]+\//, '');
}

/** Тариф модели; `undefined`, если модель не найдена в справочнике. */
export function findLlmModelTariff(model: string): LlmModelTariff | undefined {
    const normalized = normalizeLlmModelId(model);
    const direct = tariffByModelId.get(normalized);
    if (direct) return direct;

    const alias = LLM_MODEL_TARIFF_ALIASES[normalized];
    return alias ? tariffByModelId.get(alias) : undefined;
}

export type LlmUsageCostRub = {
    inputRub: number;
    outputRub: number;
    totalRub: number;
    /** Есть записи с моделями вне справочника — сумма неполная. */
    hasUnknownModels: boolean;
};

/** Стоимость пачки токенов по одному тарифу (₽). */
export function llmTokensCostRub(
    inputTokens: number,
    outputTokens: number,
    tariff: LlmModelTariff,
): Pick<LlmUsageCostRub, 'inputRub' | 'outputRub' | 'totalRub'> {
    const inputRub = (inputTokens / 1000) * tariff.inputRubPer1k;
    const outputRub = (outputTokens / 1000) * tariff.outputRubPer1k;
    return { inputRub, outputRub, totalRub: inputRub + outputRub };
}

/** Агрегирует примерную стоимость по разбивке usage по моделям. */
export function aggregateLlmUsageCostRub(
    rows: ReadonlyArray<{ model: string; inputTokens: number; outputTokens: number }>,
): LlmUsageCostRub {
    let inputRub = 0;
    let outputRub = 0;
    let hasUnknownModels = false;

    for (const row of rows) {
        const tariff = findLlmModelTariff(row.model);
        if (!tariff) {
            hasUnknownModels = true;
            continue;
        }
        const part = llmTokensCostRub(row.inputTokens, row.outputTokens, tariff);
        inputRub += part.inputRub;
        outputRub += part.outputRub;
    }

    return { inputRub, outputRub, totalRub: inputRub + outputRub, hasUnknownModels };
}

/** Форматирование суммы в рублях для UI. */
export function formatLlmCostRub(value: number): string {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}
