export type Designation = {
    /** TC по которому выполнялось определение. */
    tcId: string;
    /** Значения по каждому слоту. */
    values: DesignationValue[];
};

export type DesignationValue = {
    /** Соответствует DesignationSlot.index. */
    slotIndex: number;
    /**
     * Итоговое значение параметра, напр. "700", "У1", "ВД".
     * `null` — если по требованиям заявки и правилам ТУ значение нельзя определить
     * даже приблизительно (UI рендерит плашку «не определено»).
     */
    value: string | null;
    /**
     * Уверенность LLM: 0–1.
     * Значения < 0.7 подсвечиваются в UI для ручной проверки.
     */
    confidence: number;
    /** Объяснение выбора значения — конструктор видит логику LLM. */
    reasoning: string;
};
