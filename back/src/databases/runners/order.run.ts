import type { Order, OrderDetails } from '@miracle/types';
import type { JsonCollection } from '../db.js';

/**
 * Проставляет индексы требованиям в OrderDetails если они отсутствуют.
 * Необходим для заказов созданных до введения поля `index` в OrderRequirement.
 */
function assignIndicesIfMissing(details: OrderDetails | null | undefined): { details: OrderDetails; changed: boolean } | null {
    if (!details?.requirements?.length) return null;

    const needsFix = details.requirements.some((r) => r.index == null);
    if (!needsFix) return null;

    return {
        details: {
            ...details,
            requirements: details.requirements.map((r, i) => ({
                ...r,
                index: r.index ?? i,
                used: r.used ?? true,
            })),
        },
        changed: true,
    };
}

export async function runOrderRequirementIndexFix(orderDb: JsonCollection<Order>): Promise<number> {
    const orders = orderDb.list();
    let updatedCount = 0;

    for (const order of orders) {
        const analysedFix = assignIndicesIfMissing(order.analysedDetails);
        const redactedFix = assignIndicesIfMissing(order.redactedDetails);

        if (analysedFix || redactedFix) {
            await orderDb.update(order.id, {
                ...order,
                ...(analysedFix ? { analysedDetails: analysedFix.details } : {}),
                ...(redactedFix ? { redactedDetails: redactedFix.details } : {}),
            });
            updatedCount += 1;
        }
    }

    return updatedCount;
}
