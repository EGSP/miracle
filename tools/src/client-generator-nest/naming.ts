export function stripSuffix(value: string, suffix: string): string {
    return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}

export function toPascalCase(value: string): string {
    return value
        .replace(/\.controller$/u, '')
        .replace(/\.client$/u, '')
        .split(/[^a-zA-Z0-9]+/u)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

export function toCamelCase(value: string): string {
    const pascal = toPascalCase(value);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function normalizeUrl(...parts: string[]): string {
    const joined = parts
        .filter((part) => part.length > 0 && part !== '/')
        .map((part) => part.replace(/^\/+|\/+$/gu, ''))
        .filter(Boolean)
        .join('/');

    return `/${joined}`;
}

export function toImportPath(value: string): string {
    const normalized = value.replace(/\\/gu, '/').replace(/\.(ts|tsx|js|jsx)$/u, '');
    return normalized.startsWith('.') ? normalized : `./${normalized}`;
}

/**
 * `UsersController` → `users`, `OrderAnalysisController` → `orderAnalysis`.
 * Без суффикса `Controller`, в camelCase. Используется и как имя объекта-клиента,
 * и как basename для файла (`users.client.ts`).
 */
export function controllerBasename(className: string): string {
    return toCamelCase(stripSuffix(className, 'Controller'));
}
