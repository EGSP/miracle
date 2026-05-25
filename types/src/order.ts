import { Dual } from "./ai.js";
import type { Designation } from "./designation.js";

export type OrderRequirement = {
    /** Уникальный номер требования. ИИ-требования: 0…N (воркер). Человеческие новые: 10000+. */
    index: number;
    parameterName: string;
    requiredValue: string;
    /**
     * Только для требований в слое `details.requirements[*].ai`.
     * false = пользователь скрыл требование (отображается серым, не участвует в обработке).
     * По умолчанию true.
     */
    used?: boolean;
};

export type OrderDetails = {
    clientCompanyName?: Dual<string>;
    requirements?: Dual<OrderRequirement>[];
    /** Тип продукции из справочника (после анализа заявки или ручного выбора). */
    productTypeId?: string;
    productTypeName?: string;
    /**
     * Условное обозначение.
     * ai — результат DesignationWorker.
     * human — ручная правка конструктора.
     */
    designation?: Dual<Designation>;
};

export type Order = {
    authorId: string;
    fileId?: string | null;
    details?: OrderDetails | null;
};

export type OrderQuery = {
    id?: string;
    authorId?: string;
    fileId?: string;
};

export function getOrderProductTypeId(details?: OrderDetails | null): string | undefined {
    return details?.productTypeId?.trim() || undefined;
}
