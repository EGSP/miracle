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
     * Только для ИИ-требований в `analysedDetails`.
     * false = пользователь скрыл требование (отображается серым, не участвует в обработке).
     * По умолчанию true.
     */
    used?: boolean;
};

export type OrderDetails = {
    clientCompanyName?: string;
    productCategory?: ProductCategory;
    requirements?: OrderRequirement[];
};

export type Order = {
    authorId: string;
    fileId?: string | null;
    analysedDetails?: OrderDetails | null;
    redactedDetails?: OrderDetails | null;
};

export type OrderQuery = {
    id?: string;
    authorId?: string;
    fileId?: string;
}