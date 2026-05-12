export const ProductCategory = {
    NEMS: 'НЭМС',
    Bushing: 'Втулка',
} as const;
export type ProductCategory = typeof ProductCategory[keyof typeof ProductCategory];

export type OrderRequirement = {
    parameterName: string;
    requiredValue: string;
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