import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import { toCamelCase, toImportPath } from './naming.js';
import type {
    AppModel,
    ExternalTypeImportModel,
    NormalizedClientGeneratorConfig,
    RouteModel,
    RouterModel,
} from './types.js';

export async function writeClient(
    appModel: AppModel,
    config: NormalizedClientGeneratorConfig,
): Promise<void> {
    await rm(config.outputDir, { recursive: true, force: true });
    await mkdir(path.join(config.outputDir, 'models'), { recursive: true });

    await Promise.all([
        writeHttpHelper(config.outputDir),
        writeCommonModels(appModel, config.outputDir),
        ...appModel.routers.map((router) => writeRouterModels(router, config.outputDir)),
        ...appModel.routers.map((router) => writeRouterClient(router, config)),
    ]);

    await writeBarrelFiles(appModel, config.outputDir);
}

async function writeHttpHelper(outputDir: string): Promise<void> {
    const content = `${GENERATED_HEADER}
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
`;

    await writeFile(path.join(outputDir, 'http.ts'), content, 'utf8');
}

async function writeCommonModels(appModel: AppModel, outputDir: string): Promise<void> {
    if (!appModel.commonModelSourceText) {
        return;
    }

    const content = [
        GENERATED_HEADER.trimEnd(),
        appModel.commonModelSourceText,
        '',
    ].filter(Boolean).join('\n\n');

    await writeFile(path.join(outputDir, 'models', 'common.models.ts'), content, 'utf8');
}

async function writeRouterModels(router: RouterModel, outputDir: string): Promise<void> {
    const commonImport = router.commonTypeNames.length > 0
        ? `import type { ${router.commonTypeNames.join(', ')} } from './common.models';`
        : undefined;
    const externalImports = getExternalTypeImportLines(router.routes.flatMap((route) => (
        route.responseTypeText
            ? filterExternalTypeImportsByText(route.externalTypeImports, route.responseTypeText)
            : []
    )));
    const routeModels = router.routes.flatMap((route) => {
        const aliases = [
            route.responseTypeText
                ? `export type ${route.responseTypeName} = ${route.responseTypeText};`
                : undefined,
        ];

        return aliases.filter((alias): alias is string => Boolean(alias));
    });
    const modelBody = [
        commonImport,
        externalImports,
        router.modelSourceText,
        routeModels.join('\n\n'),
    ].filter(Boolean);

    if (modelBody.length === 0) {
        return;
    }

    const content = [
        GENERATED_HEADER.trimEnd(),
        ...modelBody,
        '',
    ].filter(Boolean).join('\n\n');

    await writeFile(
        path.join(outputDir, 'models', `${router.fileBaseName}.models.ts`),
        content,
        'utf8',
    );
}

async function writeRouterClient(
    router: RouterModel,
    config: NormalizedClientGeneratorConfig,
): Promise<void> {
    const modelImport = './models';
    const externalImports = getClientExternalTypeImports(router);
    const externalTypeNames = new Set(externalImports.map((externalImport) => externalImport.typeName));
    const typeNames = router.routes.flatMap((route) => [
        ...route.clientArgs.flatMap((arg) => arg.referencedTypeNames),
        route.responseTypeName,
    ])
        .filter((typeName): typeName is string => Boolean(typeName))
        .filter((typeName) => !externalTypeNames.has(typeName));
    const customInstanceImport = getRelativeImport(config.outputDir, config.customInstancePath);
    const usesFormatPath = router.routes.some((route) => route.hasParams);
    const modelTypeNames = Array.from(new Set(typeNames));
    const imports = [
        `import { customInstance } from '${customInstanceImport}';`,
        usesFormatPath ? `import { formatPath } from './http';` : undefined,
        getExternalTypeImportLines(externalImports),
        modelTypeNames.length > 0
            ? `import type { ${modelTypeNames.join(', ')} } from '${modelImport}';`
            : undefined,
    ].filter(Boolean).join('\n');

    const methods = router.routes.map((route) => writeRouteMethod(route)).join('\n');
    const content = `${GENERATED_HEADER}${imports}

export const ${toCamelCase(router.name)} = {
${methods}
};
`;

    await writeFile(path.join(config.outputDir, `${router.fileBaseName}.client.ts`), content, 'utf8');
}

function getClientExternalTypeImports(router: RouterModel): ExternalTypeImportModel[] {
    return uniqueExternalTypeImports(router.routes.flatMap((route) => {
        const clientTypeTexts = route.clientArgs.map((arg) => arg.typeText);

        if (!route.responseTypeText) {
            clientTypeTexts.push(route.responseTypeName);
        }

        return filterExternalTypeImportsByText(route.externalTypeImports, clientTypeTexts.join('\n'));
    }));
}

function filterExternalTypeImportsByText(
    externalTypeImports: ExternalTypeImportModel[],
    typeText: string,
): ExternalTypeImportModel[] {
    return externalTypeImports.filter((externalTypeImport) => (
        new RegExp(`\\b${escapeRegExp(externalTypeImport.typeName)}\\b`, 'u').test(typeText)
    ));
}

function getExternalTypeImportLines(externalTypeImports: ExternalTypeImportModel[]): string | undefined {
    const importsByModule = new Map<string, string[]>();

    uniqueExternalTypeImports(externalTypeImports).forEach(({ moduleSpecifier, typeName }) => {
        const typeNames = importsByModule.get(moduleSpecifier) ?? [];
        typeNames.push(typeName);
        importsByModule.set(moduleSpecifier, typeNames);
    });

    const lines = Array.from(importsByModule)
        .map(([moduleSpecifier, typeNames]) => (
            `import type { ${Array.from(new Set(typeNames)).sort().join(', ')} } from '${moduleSpecifier}';`
        ));

    return lines.length > 0 ? lines.join('\n') : undefined;
}

function uniqueExternalTypeImports(externalTypeImports: ExternalTypeImportModel[]): ExternalTypeImportModel[] {
    const seen = new Set<string>();

    return externalTypeImports.filter((externalTypeImport) => {
        const key = `${externalTypeImport.moduleSpecifier}:${externalTypeImport.typeName}`;

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function writeRouteMethod(route: RouteModel): string {
    const args = route.clientArgs.map((arg) => `${arg.name}: ${arg.typeText}`).join(', ');
    const paramsArg = route.clientArgs.find((arg) => arg.source === 'params')?.name;
    const queryArg = route.clientArgs.find((arg) => arg.source === 'query')?.name;
    const bodyArg = route.clientArgs.find((arg) => arg.source === 'body')?.name;
    const configLines = [
        `method: '${route.method.toUpperCase()}',`,
        `url: ${paramsArg ? `formatPath('${route.fullPath}', ${paramsArg})` : `'${route.fullPath}'`},`,
        queryArg ? `params: ${queryArg},` : undefined,
        bodyArg ? `data: ${bodyArg},` : undefined,
    ].filter(Boolean);

    return `    ${route.name}: (${args}) => customInstance<${route.responseTypeName}>({
${configLines.map((line) => `        ${line}`).join('\n')}
    }),`;
}

async function writeBarrelFiles(appModel: AppModel, outputDir: string): Promise<void> {
    const clientExports = [
        GENERATED_HEADER.trimEnd(),
        ...appModel.routers.map((router) => `export * from './${router.fileBaseName}.client';`),
        '',
    ].join('\n');
    const modelExports = [
        GENERATED_HEADER.trimEnd(),
        appModel.commonModelSourceText ? "export * from './common.models';" : undefined,
        ...appModel.routers
            .filter((router) => router.hasModelFile)
            .map((router) => `export * from './${router.fileBaseName}.models';`),
        '',
    ].filter((line): line is string => Boolean(line)).join('\n');

    await Promise.all([
        writeFile(path.join(outputDir, 'index.ts'), clientExports, 'utf8'),
        writeFile(path.join(outputDir, 'models', 'index.ts'), modelExports, 'utf8'),
    ]);
}

function getRelativeImport(fromDir: string, toPath: string): string {
    const relativePath = path.relative(fromDir, toPath);
    return toImportPath(relativePath);
}

const GENERATED_HEADER = `/* eslint-disable */
// This file is generated by @miracle/tools client-generator. Do not edit manually.

`;
