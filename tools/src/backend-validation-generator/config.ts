import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import type {
    BackendValidationGeneratorConfig,
    NormalizedBackendValidationGeneratorConfig,
} from './types.js';

export async function loadConfig(configPath?: string): Promise<NormalizedBackendValidationGeneratorConfig> {
    const workspaceRoot = findWorkspaceRoot(process.cwd());
    const resolvedConfigPath = path.resolve(
        configPath ?? path.join(workspaceRoot, 'back/validation-generator.config.ts'),
    );

    if (!existsSync(resolvedConfigPath)) {
        throw new Error(`Backend validation generator config was not found: ${resolvedConfigPath}`);
    }

    const configModule = await import(`${pathToFileURL(resolvedConfigPath).href}?t=${Date.now()}`);
    const config = configModule.default as BackendValidationGeneratorConfig | undefined;

    if (!config) {
        throw new Error(`Backend validation generator config must export a default object: ${resolvedConfigPath}`);
    }

    const configDir = path.dirname(resolvedConfigPath);
    const inputPath = path.resolve(configDir, config.input);
    const outputDir = path.resolve(configDir, config.output);
    const tsConfigPath = config.tsConfig
        ? path.resolve(configDir, config.tsConfig)
        : findNearestFile(path.dirname(inputPath), 'tsconfig.json');

    return {
        configPath: resolvedConfigPath,
        configDir,
        inputPath,
        outputDir,
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
