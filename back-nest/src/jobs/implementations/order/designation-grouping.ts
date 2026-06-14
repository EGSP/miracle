import { estimateTokens, type OrderPosition, type Stored } from '@miracle/types';

/** Группа однотипной продукции: одно ТУ + подмножество позиций. Подгруппа — это та же структура. */
export type PositionGroup = {
    readonly tcId: string;
    readonly positionIds: string[];
};

/** Детерминированная сортировка позиций по id — основа стабильности локальных индексов при возобновлении. */
export function sortPositionsById(positions: Stored<OrderPosition>[]): Stored<OrderPosition>[] {
    return [...positions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Примерная «стоимость» позиции в токенах: дословное название + требования. */
export function positionTokenCost(position: Stored<OrderPosition>): number {
    const text = [position.name, ...(position.data.requirements ?? [])].join('\n');
    return estimateTokens(text);
}

/**
 * Разбивает позиции одного ТУ на подгруппы по бюджету токенов (greedy bin-packing).
 *
 * Подгруппа — НЕ новая сущность: это тот же `tcId` с подмножеством позиций. Порядок позиций
 * детерминирован (сортировка по id), поэтому при возобновлении тот же бюджет даёт то же разбиение
 * и те же локальные индексы. `budget === undefined` → одна группа со всеми позициями (выключено).
 */
export function splitGroupByTokenBudget(
    tcId: string,
    positions: Stored<OrderPosition>[],
    budget: number | undefined,
): PositionGroup[] {
    const sorted = sortPositionsById(positions);
    if (sorted.length === 0) {
        return [];
    }
    if (budget === undefined) {
        return [{ tcId, positionIds: sorted.map((position) => position.id) }];
    }

    const groups: PositionGroup[] = [];
    let current: string[] = [];
    let currentCost = 0;
    for (const position of sorted) {
        const cost = positionTokenCost(position);
        if (current.length > 0 && currentCost + cost > budget) {
            groups.push({ tcId, positionIds: current });
            current = [];
            currentCost = 0;
        }
        current.push(position.id);
        currentCost += cost;
    }
    if (current.length > 0) {
        groups.push({ tcId, positionIds: current });
    }
    return groups;
}
