export type Order = {
    authorId: string;
    fileId?: string;

    requirements?: OrderRequirement[];
}

/**
 * Требования к заказу. 
 * Например:
 * - "Материал: дерево"
 * - "Цвет: красный"
 * - "Размер: 100x100"
 * - "Количество: 10"
 * - "Цена: 1000"
 * - "Срок выполнения: 10 дней"
 * - "Статус: в работе"
 * - "Статус: выполнен"
 */
export type OrderRequirement = {
    name: string;
    value: string;
}

export type OrderQuery = {
    id?: string;
    authorId?: string;
    fileId?: string;
    includeRequirements?: boolean;
}