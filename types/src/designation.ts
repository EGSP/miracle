import type { Confidence } from './confidence.js';

/**
 * Условное обозначение позиции — отдельная сущность (таблица `designations`), 1:1 с позицией.
 * Результат шага designation-analyse. Связь плоская через `orderPositionId`.
 */
export type Designation = {
    /** Позиция, к которой относится обозначение (уникальна — одно обозначение на позицию). */
    orderPositionId: string;
    /** TC по которому выполнялось определение. */
    tcId: string;
    /** Значения по каждому слоту. */
    values: DesignationValue[];
};

export type DesignationValue = {
    /** Соответствует SlotRule.index в TC. */
    slotIndex: number;
    /**
     * Итоговое значение параметра, напр. "700", "У1", "ВД".
     * `null` — если по требованиям заявки и правилам ТУ значение нельзя определить
     * даже приблизительно (UI рендерит плашку «не определено»).
     */
    value: string | null;
    /**
     * Уверенность LLM: `low` подсвечивается в UI как критичная, `medium` — как предупреждение,
     * `high` — без подсветки (см. `designation-display.ts`).
     */
    confidence: Confidence;
    /** Объяснение выбора значения — конструктор видит логику LLM. */
    reasoning: string;
};
