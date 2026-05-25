import type { Designation, DesignationValue } from '@miracle/types';

/** Подсветка ячейки по уверенности LLM. */
export type DesignationDisplayTone = 'none' | 'warn' | 'critical';

export type DesignationDisplayPart = {
    slotIndex: number;
    text: string;
    tone: DesignationDisplayTone;
};

/** Пороги подсветки (согласованы с DesignationValue.confidence в типах). */
const CONFIDENCE_WARN = 0.7;
const CONFIDENCE_CRITICAL = 0.5;

/** `null`, пустая строка и литерал `"null"` (иногда приходит от LLM) — «не задано». */
export function isUnsetDesignationValue(value: string | null | undefined): boolean {
    return !isSetDesignationValue(value);
}

export function isSetDesignationValue(value: string | null | undefined): value is string {
    if (value === null || value === undefined) {
        return false;
    }
    const trimmed = value.trim();
    return trimmed !== '' && trimmed.toLowerCase() !== 'null';
}

/** Текст ячейки: незаданные значения → «?». */
export function designationDisplayText(value: string | null): string {
    return isSetDesignationValue(value) ? value : '?';
}

export function designationDisplayTone(value: DesignationValue | undefined): DesignationDisplayTone {
    if (!value || isUnsetDesignationValue(value.value)) {
        return 'warn';
    }
    if (value.confidence < CONFIDENCE_CRITICAL) {
        return 'critical';
    }
    if (value.confidence < CONFIDENCE_WARN) {
        return 'warn';
    }
    return 'none';
}

/**
 * Строит части условного обозначения по `designation.values`:
 * от min(slotIndex) до max(slotIndex), пропуски — «?»;
 * value null / `"null"` / пусто — «?».
 */
export function buildDesignationDisplayParts(designation: Designation): DesignationDisplayPart[] {
    const { values } = designation;
    if (values.length === 0) {
        return [];
    }

    const bySlot = new Map<number, DesignationValue>();
    for (const entry of values) {
        bySlot.set(entry.slotIndex, entry);
    }

    let min = values[0].slotIndex;
    let max = values[0].slotIndex;
    for (const entry of values) {
        if (entry.slotIndex < min) min = entry.slotIndex;
        if (entry.slotIndex > max) max = entry.slotIndex;
    }

    const parts: DesignationDisplayPart[] = [];
    for (let slotIndex = min; slotIndex <= max; slotIndex++) {
        const entry = bySlot.get(slotIndex);
        if (entry) {
            parts.push({
                slotIndex,
                text: designationDisplayText(entry.value),
                tone: designationDisplayTone(entry),
            });
        } else {
            parts.push({
                slotIndex,
                text: '?',
                tone: 'warn',
            });
        }
    }
    return parts;
}
