import { Dual } from "./ai.js";
import type { Designation } from "./designation.js";

export const ProductCategory = {
    NEMS: 'НЭМС',
    Bushing: 'Втулка',
} as const;
export type ProductCategory = typeof ProductCategory[keyof typeof ProductCategory];

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
    productCategory?: Dual<ProductCategory>;
    requirements?: Dual<OrderRequirement>[];
    /** Тип продукции, определённый из заявки. */
    productTypeId?: string;
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
}