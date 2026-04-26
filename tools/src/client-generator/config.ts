import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import type {
    ClientGeneratorConfig,
    NormalizedClientGeneratorConfig,
} from './types.js';

export async function loadConfig(configPath?: string): Promise<NormalizedClientGeneratorConfig> {
    const workspaceRoot = findWorkspaceRoot(process.cwd());
    const resolvedConfigPath = path.resolve(
        configPath ?? path.join(workspaceRoot, 'front/src/lib/client-generator.config.ts'),
    );

    if (!existsSync(resolvedConfigPath)) {
        throw new Error(`Client generator config was not found: ${resolvedConfigPath}`);
    }

    const configModule = await import(`${pathToFileURL(resolvedConfigPath).href}?t=${Date.now()}`);
    const config = configModule.default as ClientGeneratorConfig | undefined;

    if (!config) {
        throw new Error(`Client generator config must export a default object: ${resolvedConfigPath}`);
    }

    const configDir = path.dirname(resolvedConfigPath);
    const inputPath = path.resolve(configDir, config.input);
    const outputDir = path.resolve(configDir, config.output);
    const customInstancePath = path.resolve(configDir, config.customInstance);
    const tsConfigPath = config.tsConfig
        ? path.resolve(configDir, config.tsConfig)
        : findNearestFile(path.dirname(inputPath), 'tsconfig.json');

    return {
        configPath: resolvedConfigPath,
        configDir,
        inputPath,
        outputDir,
        customInstancePath,
        customInstanceImport: config.customInstance,
        tsConfigPath,
    };
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

function findNearestFile(startDir: string, fileName: string): string {
    let currentDir = path.resolve(startDir);

    while (true) {
        const filePath = path.join(currentDir, fileName);

        if (existsSync(filePath)) {
            return filePath;
        }

        const parentDir = path.dirname(currentDir);

        if (parentDir === currentDir) {
            throw new Error(`Could not find ${fileName} from ${startDir}`);
        }

        currentDir = parentDir;
    }
}
