/**
 * Базовые поля персистентной сущности — контракт API, разделяемый между бэкендом и фронтом.
 *
 * Тип дат — `Date | string`, потому что на бэкенде Prisma возвращает нативный `Date`,
 * а по HTTP после JSON.stringify/parse на фронте то же поле приходит как ISO-строка.
 * Маппинг на бэкенде не выполняется; фронт нормализует даты через `new Date(value)`.
 */
export type DbEntity = {
    id: string;
    createdAt: Date | string;
    updatedAt: Date | string;
    deletedAt?: Date | string | null;
};

export type Stored<T extends object> = T & DbEntity;

/** Запись с полем `deletedAt` из {@link DbEntity} (в т.ч. {@link Stored}). */
export type DeletableEntity = Pick<DbEntity, 'deletedAt'>;

/** `true`, если сущность помечена мягким удалением (`deletedAt` задан). */
export function hasDeletion(entity: DeletableEntity): boolean {
    return entity.deletedAt != null;
}
