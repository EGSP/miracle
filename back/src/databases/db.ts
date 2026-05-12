import { mkdir } from 'fs/promises';
import { randomUUID } from 'crypto';
import path from 'path';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { DbEntity } from '@miracle/types';
import { merge } from 'ts-deepmerge';

export type JsonDb<TData extends object> = Low<TData>;

/**
 * Сущность с полями БД (`id`, `createdAt`, `updatedAt`).
 *
 * Использует дистрибутивный условный тип вместо прямого `Omit<TItem, keyof DbEntity> & DbEntity`,
 * потому что `Omit` не сохраняет union-структуру: `keyof (A | B | C)` вычисляется как
 * *пересечение* ключей всех членов, и `Omit` оставляет лишь поля, общие для каждого из них.
 *
 * Форма `TItem extends object ? ... : never` с *naked type parameter* заставляет TypeScript
 * применять преобразование к каждому члену union независимо:
 * `StoredEntity<A | B | C>` → `StoredEntity<A> | StoredEntity<B> | StoredEntity<C>`.
 *
 * @example
 * // WorkerData = YandexOcrWorkerData | ServerHealthWorkerData | YandexPingWorkerData
 * // Без дистрибутивности поле diskTotalBytes (есть только у ServerHealthWorkerData)
 * // было бы потеряно, и дискриминант type перестал бы работать для narrowing.
 * type W = StoredEntity<WorkerData>; // → StoredEntity<YandexOcrWorkerData> | StoredEntity<ServerHealthWorkerData> | ...
 */
export type StoredEntity<TItem extends object> =
    TItem extends object ? Omit<TItem, keyof DbEntity> & DbEntity : never;

/**
 * Входные данные для создания сущности: все поля кроме системных полей БД,
 * плюс опциональный `id` (если не передан — генерируется автоматически).
 *
 * Дистрибутивный по той же причине, что {@link StoredEntity}.
 */
export type CreateEntityInput<TItem extends object> =
    TItem extends object ? Omit<TItem, keyof DbEntity> & Partial<Pick<DbEntity, 'id'>> : never;

/**
 * Входные данные для обновления сущности: все поля кроме системных — опциональны.
 *
 * Дистрибутивный по той же причине, что {@link StoredEntity}.
 */
export type UpdateEntityInput<TItem extends object> =
    TItem extends object ? Partial<Omit<TItem, keyof DbEntity>> : never;

export type CreateJsonDbOptions<TData extends object> = {
    name: string;
    defaultData: TData;
};

export type CollectionData<TItem extends object> = {
    items: StoredEntity<TItem>[];
};

export type CollectionMiddleware<TItem extends object> = {
    beforeCreate?: (item: StoredEntity<TItem>) => void;
    beforeUpdate?: (item: StoredEntity<TItem>, patch: UpdateEntityInput<TItem>) => void;
};

export interface DbRegistry { }

export const db = {} as DbRegistry;

const DB_DIR = process.env.DB_DIR
    ? path.resolve(process.env.DB_DIR)
    : path.resolve(process.cwd(), 'data');

const timestampsMiddleware: CollectionMiddleware<object> = {
    beforeCreate(item) {
        const now = Date.now();

        item.createdAt = now;
        item.updatedAt = now;
    },
    beforeUpdate(item) {
        item.updatedAt = Date.now();
    },
};

function getDbFilePath(name: string): string {
    const fileName = name.endsWith('.json') ? name : `${name}.json`;
    return path.join(DB_DIR, fileName);
}

export async function createJsonDb<TData extends object>({
    name,
    defaultData,
}: CreateJsonDbOptions<TData>): Promise<JsonDb<TData>> {
    await mkdir(DB_DIR, { recursive: true });

    const adapter = new JSONFile<TData>(getDbFilePath(name));
    const db = new Low(adapter, defaultData);

    await db.read();
    await db.write();

    return db;
}

export class JsonCollection<TItem extends object> {
    private constructor(
        private readonly db: JsonDb<CollectionData<TItem>>,
        private readonly middlewares: CollectionMiddleware<TItem>[],
    ) { }

    static async create<TItem extends object>(
        name: string,
        middlewares: CollectionMiddleware<TItem>[] = [],
    ): Promise<JsonCollection<TItem>> {
        const db = await createJsonDb<CollectionData<TItem>>({
            name,
            defaultData: {
                items: [],
            },
        });

        return new JsonCollection<TItem>(db, [
            timestampsMiddleware as CollectionMiddleware<TItem>,
            ...middlewares,
        ]);
    }

    ref():StoredEntity<TItem>[] {
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

        this.middlewares.forEach((middleware) => middleware.beforeCreate?.(item));
        this.db.data.items.push(item);
        await this.db.write();

        return structuredClone(item);
    }

    async update(id: string, patch: UpdateEntityInput<TItem>): Promise<StoredEntity<TItem> | undefined> {
        const item = this.getItemById(id);

        if (!item) {
            return undefined;
        }

        Object.assign(item, merge.withOptions({ mergeArrays: false }, item, patch));
        this.middlewares.forEach((middleware) => middleware.beforeUpdate?.(item, patch));
        await this.db.write();

        return structuredClone(item);
    }

    async delete(id: string): Promise<boolean> {
        const itemIndex = this.db.data.items.findIndex((item) => item.id === id);

        if (itemIndex === -1) {
            return false;
        }

        this.db.data.items.splice(itemIndex, 1);
        await this.db.write();

        return true;
    }

    private getItemById(id: string): StoredEntity<TItem> | undefined {
        return this.db.data.items.find((item) => item.id === id);
    }
}

export function registerDb<TName extends string, TCollection>(
    name: TName,
    collection: TCollection,
): TCollection {
    Object.assign(db, { [name]: collection });
    return collection;
}
