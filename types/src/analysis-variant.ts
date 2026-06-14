/**
 * Варианты анализа заказа и их параметры запуска — аналог {@link OrderReportInfo} для отчётов.
 * Описываются декларативно рядом с определением джобы; фронт подгружает их динамически и рендерит
 * параметры (булевы → чекбоксы) с подсказками из `description`.
 */

/** Тип параметра запуска анализа. Пока только `boolean` (чекбокс). */
export type AnalysisParamType = 'boolean';

/** Декларативное описание одного параметра запуска анализа. */
export type AnalysisParamDef = {
    /** Ключ параметра — попадает в `AnalyseOrderRequest.params`. */
    key: string;
    /** Подпись чекбокса. */
    label: string;
    /** Helper text под чекбоксом. */
    description: string;
    type: AnalysisParamType;
    /** Значение по умолчанию (предзаполняет форму). */
    default: boolean;
};

/** Краткая инфа о варианте анализа для дропдауна (как {@link OrderReportInfo}). */
export type AnalysisVariantInfo = {
    id: string;
    name: string;
    description: string;
};

/** Полный дескриптор варианта: инфа + схема параметров. */
export type AnalysisVariant = AnalysisVariantInfo & {
    params: AnalysisParamDef[];
};

/** Блокер запуска анализа — причина, по которой запуск невозможен. */
export type AnalysisBlocker =
    | { kind: 'active-run'; message: string }
    | { kind: 'unprepared-visual'; message: string; applicationId: string; fileId: string };

/** Готовность заказа к запуску анализа выбранным вариантом. */
export type AnalysisReadiness = {
    /** `true`, если блокеров нет и запуск разрешён. */
    canRun: boolean;
    blockers: AnalysisBlocker[];
};

/** Тело запроса запуска анализа: выбранный вариант + значения булевых параметров. */
export type AnalyseOrderRequest = {
    variantId: string;
    params: Record<string, boolean>;
};
