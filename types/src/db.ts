export type UnixTimestamp = number;

export type DbEntity = {
    id: string;
    createdAt: UnixTimestamp;
    updatedAt: UnixTimestamp;
    deletedAt?: UnixTimestamp | null;
};

export type Stored<T extends object> = T & DbEntity;

/** Запись с полем `deletedAt` из {@link DbEntity} (в т.ч. {@link Stored}). */
export type DeletableEntity = Pick<DbEntity, 'deletedAt'>;

/** `true`, если сущность помечена мягким удалением (`deletedAt` задан). */
export function hasDeletion(entity: DeletableEntity): boolean {
    return entity.deletedAt != null;
}