import type { Confidence } from './confidence.js';
import type { Designation, DesignationValue } from './designation.js';
import type { TechnicalCondition } from './technical-condition.js';

/**
 * Чистая логика отображения условного обозначения — общая для UI и серверных потребителей
 * (например, Excel-отчёта). Без React/CSS: их UI-обёртки (классы тонов) живут на фронте.
 */

/** Подсветка ячейки по уверенности LLM. */
export type DesignationDisplayTone = 'none' | 'warn' | 'critical';

export type DesignationDisplayPart = {
    slotIndex: number;
    text: string;
    tone: DesignationDisplayTone;
};

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
    if (value.confidence === 'low') {
        return 'critical';
    }
    if (value.confidence === 'medium') {
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
            parts.push({ slotIndex, text: '?', tone: 'warn' });
        }
    }
    return parts;
}

/** Плоский текст условного обозначения для буфера: части через «-», пропуски и незаданные — «?». */
export function buildDesignationDisplayCopyText(designation: Designation): string {
    return buildDesignationDisplayParts(designation)
        .map((part) => part.text)
        .join('-');
}

/**
 * Рендерит строку по шаблону вида "[1] [2]-[3]-...-[10]" (1-based).
 * Незаполненные/пустые значения, пропуски и выход за диапазон — «?».
 */
export function renderDesignationTemplate(
    designation: Designation,
    tc: TechnicalCondition,
    template: string | null | undefined,
): string {
    const format = template?.trim();
    if (!format) {
        return buildDesignationDisplayCopyText(designation);
    }

    const valueBySlot = new Map<number, string | null>();
    for (const entry of designation.values) {
        valueBySlot.set(entry.slotIndex, entry.value);
    }

    const maxSlotIndex = (tc.slotRules ?? []).reduce((max, slot) => (slot.index > max ? slot.index : max), -1);

    return format.replace(/\[(\d+)]/g, (_, oneBasedRaw: string) => {
        const oneBasedIndex = Number(oneBasedRaw);
        if (!Number.isInteger(oneBasedIndex) || oneBasedIndex <= 0) {
            return '?';
        }

        const slotIndex = oneBasedIndex - 1;
        if (maxSlotIndex >= 0 && slotIndex > maxSlotIndex) {
            return '?';
        }

        const rawValue = valueBySlot.get(slotIndex);
        return designationDisplayText(rawValue ?? null);
    });
}

/**
 * Слот попадает в инспектор «требует проверки»: пропуск в диапазоне, пустое значение или
 * неуверенность при заданном value — как `low` (критично), так и `medium` (с сомнением).
 * Не попадают только заполненные значения с `high`.
 */
export function isDesignationInspectorIssue(entry: DesignationValue | undefined): boolean {
    if (!entry) {
        return true;
    }
    if (isUnsetDesignationValue(entry.value)) {
        return true;
    }
    return entry.confidence !== 'high';
}

export type DesignationInspectorRow = {
    slotIndex: number;
    slotName: string | null;
    tone: DesignationDisplayTone;
    confidence: Confidence | null;
    reasoning: string | null;
};

/**
 * Строки инспектора: слоты min…max с проблемами (пропуск, пусто, неуверенность low/medium).
 * `slotNames` — SlotRule.name по index из TC.
 */
export function buildDesignationInspectorRows(
    designation: Designation,
    slotNames: ReadonlyMap<number, string>,
): DesignationInspectorRow[] {
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

    const rows: DesignationInspectorRow[] = [];
    for (let slotIndex = min; slotIndex <= max; slotIndex++) {
        const entry = bySlot.get(slotIndex);
        if (!isDesignationInspectorIssue(entry)) {
            continue;
        }

        rows.push({
            slotIndex,
            slotName: slotNames.get(slotIndex) ?? null,
            tone: designationDisplayTone(entry),
            confidence: entry?.confidence ?? null,
            reasoning: entry?.reasoning ?? 'Параметр отсутствует в заявке',
        });
    }
    return rows;
}
