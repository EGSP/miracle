import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import type { ClientGeneratorNestConfig, NormalizedConfig } from './types.js';

const DEFAULT_BUILTIN_TYPE_NAMES = [
    'Array',
    'Date',
    'Error',
    'Map',
    'Promise',
    'Record',
    'Set',
    'String',
    'Number',
    'Boolean',
    'Partial',
    'Pick',
    'Omit',
    'Readonly',
    'Required',
    'Exclude',
    'Extract',
    'ReturnType',
    'Awaited',
    'NonNullable',
    'Parameters',
    'InstanceType',
    // Web API globals available in both browser and Node.js 18+
    'Blob',
    'File',
    'FormData',
    'URL',
    'URLSearchParams',
    'ReadableStream',
    'WritableStream',
];

/**
 * Загружает конфиг генератора. Если `configPath` не задан и файла-конфига по умолчанию нет —
 * используется чисто-конвенциональная раскладка: `back-nest/src/app.module.ts` → `front/src/lib/generated`.
 * Это сознательное отступление от старого генератора, где конфиг-файл был обязателен.
 */
export async function loadConfig(configPath?: string): Promise<NormalizedConfig> {
    const workspaceRoot = findWorkspaceRoot(process.cwd());

    const defaultConfigPath = path.join(workspaceRoot, 'front/src/lib/client-generator-nest.config.ts');
    const explicitConfigPath = configPath ? path.resolve(configPath) : undefined;
    const resolvedConfigPath = explicitConfigPath ?? (existsSync(defaultConfigPath) ? defaultConfigPath : undefined);

    let userConfig: ClientGeneratorNestConfig = {};
    let configDir = workspaceRoot;

    if (resolvedConfigPath) {
        if (!existsSync(resolvedConfigPath)) {
            throw new Error(`Client generator config was not found: ${resolvedConfigPath}`);
        }

        const url = `${pathToFileURL(resolvedConfigPath).href}?t=${Date.now()}`;
        const configModule = await import(url);
        const exported = configModule.default as ClientGeneratorNestConfig | undefined;

        if (!exported) {
            throw new Error(`Client generator config must export a default object: ${resolvedConfigPath}`);
        }

        userConfig = exported;
        configDir = path.dirname(resolvedConfigPath);
    }

    const inputPath = resolvePath(
        userConfig.input,
        configDir,
        path.join(workspaceRoot, 'back-nest/src/app.module.ts'),
    );
    const outputDir = resolvePath(
        userConfig.output,
        configDir,
        path.join(workspaceRoot, 'front/src/lib/generated'),
    );
    const customInstancePath = resolvePath(
        userConfig.customInstance,
        configDir,
        path.join(workspaceRoot, 'front/src/lib/api'),
    );
    const tsConfigPath = resolvePath(
        userConfig.tsConfig,
        configDir,
        path.join(workspaceRoot, 'back-nest/tsconfig.json'),
    );

    const builtinTypeNames = new Set<string>(DEFAULT_BUILTIN_TYPE_NAMES);
    userConfig.builtinTypeNames?.forEach((name) => builtinTypeNames.add(name));

    return {
        workspaceRoot,
        configPath: resolvedConfigPath,
        configDir,
        inputPath,
        outputDir,
        customInstancePath,
        customInstanceImport: userConfig.customInstance ?? path.relative(outputDir, customInstancePath),
        tsConfigPath,
        strictTypes: Boolean(userConfig.strictTypes),
        builtinTypeNames,
    };
}

function resolvePath(value: string | undefined, base: string, fallback: string): string {
    if (!value) {
        return fallback;
    }

    return path.isAbsolute(value) ? value : path.resolve(base, value);
}

function findWorkspaceRoot(startDir: string): string {
    let currentDir = path.resolve(startDir);

    while (true) {
        const packageJsonPath = path.join(currentDir, 'package.json');

        if (existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
                workspaces?: unknown;
            };

            if (packageJson.workspaces) {
                return currentDir;
            }
        }

        const parentDir = path.dirname(currentDir);

        if (parentDir === currentDir) {
            throw new Error(`Could not find workspace root from ${startDir}`);
        }

        currentDir = parentDir;
    }
}
