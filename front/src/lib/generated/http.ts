/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

export function formatPath(path: string, params?: unknown): string {
    if (!params || typeof params !== 'object') {
        return path;
    }

    const values = params as Record<string, unknown>;

    return path.replace(/:([a-zA-Z0-9_]+)/gu, (_match, key: string) => {
        const value = values[key];
        return encodeURIComponent(String(value));
    });
}
