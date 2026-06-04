import type { JobKey } from '@miracle/types';

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (typeof value !== 'object' || value === null) return false;
    const proto = Object.getPrototypeOf(value) as unknown;
    return proto === Object.prototype || proto === null;
};

/**
 * Канонический хеш ключа прогона (стиль TanStack Query `hashKey`): стабильный JSON, в котором
 * поля объектов отсортированы — порядок полей не влияет на идентичность. Порядок элементов
 * массива значим (он выражает иерархию). Результат используется как глобальная идентичность
 * прогона (`JobRun.keyHash`, уникальный индекс).
 */
export function hashKey(key: JobKey): string {
    return JSON.stringify(key, (_, value: unknown) =>
        isPlainObject(value)
            ? Object.keys(value)
                  .sort()
                  .reduce<Record<string, unknown>>((acc, field) => {
                      acc[field] = value[field];
                      return acc;
                  }, {})
            : value,
    );
}
