export type Order = {
    authorId: string;
    /** Пользовательское название; null/пустое — в UI показывается id. */
    name?: string | null;
};

export type OrderQuery = {
    id?: string;
    authorId?: string;
};

/** Отображаемое имя заказа: name или id, если name пустой/null. */
export function orderDisplayName(order: Pick<Order, 'name'> & { id: string }): string {
    const trimmed = order.name?.trim();
    return trimmed ? trimmed : order.id;
}
