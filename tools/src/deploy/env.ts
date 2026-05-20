import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export type DeployEnv = {
    PORT: string;
    NODE_ENV: string;
    CORS_ORIGIN: string;
    VITE_PORT: string;
    VITE_API_URL: string;
};

export function parseEnv(rootDir: string): DeployEnv {
    const envPath = resolve(rootDir, '.env');

    if (!existsSync(envPath)) {
        throw new Error(`.env не найден по пути: ${envPath}`);
    }

    const raw: Record<string, string> = {};
    const content = readFileSync(envPath, 'utf-8');

    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;

        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (key) raw[key] = value;
    }

    return {
        PORT:         raw['PORT']         ?? '3001',
        NODE_ENV:     raw['NODE_ENV']     ?? 'production',
        CORS_ORIGIN:  raw['CORS_ORIGIN']  ?? '',
        VITE_PORT:    raw['VITE_PORT']    ?? '8081',
        VITE_API_URL: raw['VITE_API_URL'] ?? '',
    };
}
