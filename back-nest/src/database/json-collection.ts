import { mkdir } from 'fs/promises';
import { randomUUID } from 'crypto';
import path from 'path';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import type { DbEntity } from '@miracle/types';
import { merge } from 'ts-deepmerge';

export type JsonDb<TData extends object> = Low<TData>;

/**
 * Сущность с полями БД (`id`, `createdAt`, `updatedAt`).
 *
 * Дистрибутивный условный тип сохраняет union-структуру: `StoredEntity<A | B>`
 * раскрывается в `StoredEntity<A> | StoredEntity<B>`, иначе `Omit` потерял бы
 * поля, специфичные для отдельных членов union.
 */
export type StoredEntity<TItem extends object> =
    TItem extends object ? Omit<TItem, keyof DbEntity> & DbEntity : never;

export type CreateEntityInput<TItem extends object> =
    TItem extends object ? Omit<TItem, keyof DbEntity> & Partial<Pick<DbEntity, 'id'>> : never;

export type UpdateEntityInput<TItem extends object> =
    TItem extends object ? Partial<Omit<TItem, keyof DbEntity>> : never;

export type CollectionData<TItem extends object> = {
    items: StoredEntity<TItem>[];
};

export type CollectionMiddleware<TItem extends object> = {
    beforeCreate?: (item: StoredEntity<TItem>) => void;
    beforeUpdate?: (item: StoredEntity<TItem>, patch: UpdateEntityInput<TItem>) => void;
    beforeSoftDelete?: (item: StoredEntity<TItem>, mark: boolean) => void;
};

const timestampsMiddleware: CollectionMiddleware<object> = {
    beforeCreate(item) {
        const now = Date.now();
        item.createdAt = now;
        item.updatedAt = now;
    },
    beforeUpdate(item) {
        item.updatedAt = Date.now();
    },
    beforeSoftDelete(item, mark) {
        item.deletedAt = mark ? Date.now() : null;
        item.updatedAt = Date.now();
    },
};

function getDbFilePath(dbDir: string, name: string): string {
    const fileName = name.endsWith('.json') ? name : `${name}.json`;
    return path.join(dbDir, fileName);
}

async function createJsonDb<TData extends object>(
    dbDir: string,
    name: string,
    defaultData: TData,
): Promise<JsonDb<TData>> {
    await mkdir(dbDir, { recursive: true });
    const adapter = new JSONFile<TData>(getDbFilePath(dbDir, name));
    const db = new Low(adapter, defaultData);
    await db.read();
    await db.write();
    return db;
}

export class JsonCollection<TItem extends object> {
    private constructor(
        private readonly db: JsonDb<CollectionData<TItem>>,
        private readonly middlewares: CollectionMiddleware<TItem>[],
    ) {}

    static async create<TItem extends object>(
        name: string,
        dbDir: string,
        middlewares: CollectionMiddleware<TItem>[] = [],
    ): Promise<JsonCollection<TItem>> {
        const db = await createJsonDb<CollectionData<TItem>>(dbDir, name, { items: [] });
        return new JsonCollection<TItem>(db, [
            timestampsMiddleware as CollectionMiddleware<TItem>,
            ...middlewares,
        ]);
    }

    ref(): StoredEntity<TItem>[] {
        return this.db.data.items;
    }

    list(): StoredEntity<TItem>[] {
        return structuredClone(this.db.data.items);
    }

    getById(id: string): StoredEntity<TItem> | undefined {
        const item = this.getItemById(id);
        return item ? structuredClone(item) : undefined;
    }

    async create(input: CreateEntityInput<TItem>): Promise<StoredEntity<TItem>> {
        const item = {
            ...input,
            id: input.id ?? randomUUID(),
            createdAt: 0,
            updatedAt: 0,
        } as StoredEntity<TItem>;

        this.middlewares.forEach((m) => m.beforeCreate?.(item));
        this.db.data.items.push(item);
        await this.db.write();
        return structuredClone(item);
    }

    async update(id: string, patch: UpdateEntityInput<TItem>): Promise<StoredEntity<TItem> | undefined> {
        const item = this.getItemById(id);
        if (!item) return undefined;
        Object.assign(item, merge.withOptions({ mergeArrays: false }, item, patch));
        this.middlewares.forEach((m) => m.beforeUpdate?.(item, patch));
        await this.db.write();
        return structuredClone(item);
    }

    async softDelete(id: string, mark: boolean): Promise<StoredEntity<TItem> | undefined> {
        const item = this.getItemById(id);
        if (!item) return undefined;
        this.middlewares.forEach((m) => m.beforeSoftDelete?.(item, mark));
        await this.db.write();
        return structuredClone(item);
    }

    async delete(id: string): Promise<boolean> {
        const idx = this.db.data.items.findIndex((item) => item.id === id);
        if (idx === -1) return false;
        this.db.data.items.splice(idx, 1);
        await this.db.write();
        return true;
    }

    private getItemById(id: string): StoredEntity<TItem> | undefined {
        return this.db.data.items.find((item) => item.id === id);
    }
}
