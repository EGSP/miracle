export type TechnicalCondition = {
    /** Ссылка на загруженный PDF ТУ — из него берётся FileContent. */
    fileId: string;
    /** Тип продукции, к которому относится это ТУ. */
    productTypeId: string;
    /** Правила, извлечённые из PDF воркером. Заполняются после TCWorker. */
    rules: TechnicalConditionRule[];
    /** Параметры условного обозначения. Определяет человек, ссылается на rules. */
    designationSlots: DesignationSlot[];
    /** Шаблоны отображения обозначения (полное, краткое и др.). */
    displayTemplates: DisplayTemplate[];
};

export type TechnicalConditionRule = {
    /** Уникальный идентификатор внутри TC. */
    id: string;
    /** Порядковый номер для сортировки в UI. */
    index: number;
    /** Заголовок раздела из ТУ, напр. "5.3 Климатическое исполнение". */
    title?: string;
    /** Текст правила. Таблицы хранятся как markdown-таблицы. */
    content: string;
};

export type DesignationSlot = {
    /** Позиция параметра в условном обозначении (0-based). */
    index: number;
    /** Название параметра, напр. "Климатическое исполнение". */
    name: string;
    /** Идентификаторы TechnicalConditionRule внутри этого TC. */
    ruleIds: string[];
};

export type DisplayTemplate = {
    /** Уникальный идентификатор внутри TC. */
    id: string;
    /** Читаемое название, напр. "Полное", "Краткое". */
    name: string;
    /** Индексы DesignationSlot.index, которые включаются в обозначение. */
    includedSlots: number[];
    /** Разделитель между частями обозначения, обычно "-". */
    separator: string;
};

/** Query для GET `/technical-conditions`. */
export type TechnicalConditionsQuery = {
    productTypeId?: string;
};
