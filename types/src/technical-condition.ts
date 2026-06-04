export type TechnicalCondition = {
    /** Читаемое название ТУ, напр. "ГОСТ Р 52931-2008". */
    name?: string;
    /** Ссылка на загруженный PDF ТУ — из него берётся FileContent. */
    fileId?: string;
    /** Тип продукции, к которому относится это ТУ. */
    productTypeId?: string;
    /**
     * Название типа продукции на момент последнего сохранения с указанным `productTypeId`.
     * Нужно, чтобы понимать, какой тип продукции был привязан ранее, если id снят или запись типа удалена.
     * При сохранении с `productTypeId` заполняется на сервере; без id сохраняется переданное или прежнее значение.
     */
    lastProductTypeName?: string;
    /** Правила параметров условного обозначения: название + текст из ТУ. Заполняются вручную или джобом `tc-extract`. */
    slotRules?: SlotRule[];
    /** Шаблоны отображения обозначения (полное, краткое и др.). */
    displayTemplates?: DisplayTemplate[];
};

/** Параметр условного обозначения в ТУ: название и текст правил выбора значения. */
export type SlotRule = {
    /** Позиция параметра в обозначении (0-based). Связь с `DesignationValue.slotIndex`. */
    index: number;
    /** Название параметра, напр. «Климатическое исполнение». */
    name: string;
    /** Текст правил из ТУ для этого параметра (таблицы — markdown). */
    text: string;
};

export type DisplayTemplate = {
    /** Уникальный идентификатор внутри TC. */
    id: string;
    /** Читаемое название, напр. "Полное", "Краткое". */
    name: string;
    /**
     * Строка форматирования обозначения с 1-based плейсхолдерами:
     * пример — "[1] [2]-[3]-...-[10]".
     */
    format: string;
};

/** Query для GET `/technical-conditions`. */
export type TechnicalConditionsQuery = {
    productTypeId?: string;
};
