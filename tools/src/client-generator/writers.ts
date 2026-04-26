import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import { toCamelCase, toImportPath } from './naming.js';
import type {
    AppModel,
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
    const routeModels = router.routes.flatMap((route) => {
        const aliases = [
            route.hasRequest && route.requestTypeText
                ? `export type ${route.requestTypeName} = ${route.requestTypeText};`
                : undefined,
            route.responseTypeText
                ? `export type ${route.responseTypeName} = ${route.responseTypeText};`
                : undefined,
        ];

        return aliases.filter((alias): alias is string => Boolean(alias));
    });

    const content = [
        GENERATED_HEADER.trimEnd(),
        commonImport,
        router.modelSourceText,
        routeModels.join('\n\n'),
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
    const typeNames = router.routes.flatMap((route) => [
        route.hasRequest ? route.requestTypeName : undefined,
        route.responseTypeName,
    ]).filter((typeName): typeName is string => Boolean(typeName));
    const customInstanceImport = getRelativeImport(config.outputDir, config.customInstancePath);
    const usesFormatPath = router.routes.some((route) => route.hasParams);
    const imports = [
        `import { customInstance } from '${customInstanceImport}';`,
        usesFormatPath ? `import { formatPath } from './http';` : undefined,
        `import type { ${Array.from(new Set(typeNames)).join(', ')} } from '${modelImport}';`,
    ].filter(Boolean).join('\n');

    const methods = router.routes.map((route) => writeRouteMethod(route)).join('\n');
    const content = `${GENERATED_HEADER}${imports}

export const ${toCamelCase(router.name)} = {
${methods}
};
`;

    await writeFile(path.join(config.outputDir, `${router.fileBaseName}.client.ts`), content, 'utf8');
}

function writeRouteMethod(route: RouteModel): string {
    const requestArg = route.hasRequest ? `request: ${route.requestTypeName}` : '';
    const configLines = [
        `method: '${route.method.toUpperCase()}',`,
        `url: ${route.hasParams ? `formatPath('${route.fullPath}', request.params)` : `'${route.fullPath}'`},`,
        route.hasQuery ? 'params: request.query,' : undefined,
        route.hasBody ? 'data: request.body,' : undefined,
    ].filter(Boolean);

    return `    ${route.name}: (${requestArg}) => customInstance<${route.responseTypeName}>({
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
        ...appModel.routers.map((router) => `export * from './${router.fileBaseName}.models';`),
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
