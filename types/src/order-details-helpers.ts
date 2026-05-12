import type { OrderDetails, OrderRequirement } from './order.js';

/** Есть ли сохранённый слой ИИ (совпадает с логикой бэкенда). */
export function orderDetailsHasAiLayer(details: OrderDetails | null | undefined): boolean {
    if (!details) return false;
    if (details.clientCompanyName?.ai !== undefined) return true;
    if (details.productCategory?.ai !== undefined) return true;
    if (details.requirements?.some((row) => row.ai !== undefined)) return true;
    return false;
}

/** Есть ли хотя бы одна строка требований (human и/или ai). */
export function orderDetailsHasRequirementRows(details: OrderDetails | null | undefined): boolean {
    const rows = details?.requirements;
    if (!rows?.length) return false;
    return rows.some((row) => row.human != null || row.ai != null);
}

/** Список требований для отображения: приоритет human, иначе ai. */
export function flattenRequirementsForDisplay(
    details: OrderDetails | null | undefined,
): OrderRequirement[] {
    const rows = details?.requirements ?? [];
    return rows
        .map((row) => row.human ?? row.ai)
        .filter((req): req is OrderRequirement => req != null);
}
