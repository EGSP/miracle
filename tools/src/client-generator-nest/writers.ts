import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import { toImportPath } from './naming.js';
import type {
    AppModel,
    ClientArgModel,
    ControllerModel,
    ExternalTypeImportModel,
    LocalDtoModel,
    NormalizedConfig,
    RouteModel,
} from './types.js';

const GENERATED_HEADER = `/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

`;

const MODELS_DIR = 'models';
const MODELS_BARREL_IMPORT = './models';

export async function writeAll(appModel: AppModel, config: NormalizedConfig): Promise<void> {
    await rm(config.outputDir, { recursive: true, force: true });
    await mkdir(path.join(config.outputDir, 'models'), { recursive: true });

    await Promise.all([
        writeHttpHelper(config.outputDir),
        writeCommonModels(appModel, config.outputDir),
        ...appModel.controllers.map((controller) => writeControllerModels(controller, appModel, config)),
        ...appModel.controllers.map((controller) => writeControllerClient(controller, config)),
    ]);

    await writeBarrelFiles(appModel, config.outputDir);
}

async function writeHttpHelper(outputDir: string): Promise<void> {
    const content = `${GENERATED_HEADER}export function formatPath(path: string, params?: unknown): string {
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

/**
 * Пишет `<controller>.models.ts` на верхнем уровне `outputDir`. Файл содержит:
 *  - DTO-интерфейсы (через `z.infer` от схем `@miracle/types`);
 *  - локальные `type`/`interface`/`enum`, скопированные текстом;
 *  - alias'ы для inline response-типов вида `CheckResponse = { status: 'ok' }`.
 *
 * Если нечего эмитить — файл не создаётся.
 */
async function writeControllerModels(
    controller: ControllerModel,
    appModel: AppModel,
    config: NormalizedConfig,
): Promise<void> {
    const dtoImports = collectDtoSchemaImports(controller.localDtos);
    const dtoBody = controller.localDtos
        .map((dto) => `export interface ${dto.name} extends z.infer<typeof ${dto.schemaName}> {}`)
        .join('\n');

    const responseAliases = controller.routes
        .map((route) => (route.responseTypeText ? `export type ${route.responseTypeName} = ${route.responseTypeText};` : undefined))
        .filter((line): line is string => Boolean(line))
        .join('\n');

    const commonImport = controller.commonTypeNames.length > 0
        ? `import type { ${controller.commonTypeNames.join(', ')} } from './common.models';`
        : undefined;

    const externalImports = getExternalTypeImportLines(
        controller.routes.flatMap((route) => filterExternalImportsByTypeNames(
            route.externalTypeImports,
            collectResponseModelTypeNames(route),
        )),
    );

    const sections = [
        commonImport,
        dtoImports,
        externalImports,
        controller.modelSourceText,
        dtoBody,
        responseAliases,
    ].filter(Boolean);

    if (sections.length === 0) {
        controller.hasModelFile = false;
        return;
    }

    const content = [
        GENERATED_HEADER.trimEnd(),
        ...sections,
        '',
    ].filter(Boolean).join('\n\n');

    await writeFile(
        path.join(config.outputDir, MODELS_DIR, `${controller.fileBaseName}.models.ts`),
        content,
        'utf8',
    );

    controller.hasModelFile = true;
}

async function writeControllerClient(controller: ControllerModel, config: NormalizedConfig): Promise<void> {
    const customInstanceImport = getRelativeImport(config.outputDir, config.customInstancePath);
    const usesFormatPath = controller.routes.some((route) => route.hasParams);

    const externalImports = getClientExternalTypeImports(controller);
    const externalTypeNames = new Set(externalImports.map((imp) => imp.typeName));
    const localTypeNames = unique(controller.routes.flatMap((route) => [
        ...route.clientArgs.flatMap((arg) => arg.referencedTypeNames),
        isSimpleIdentifier(route.responseTypeName) ? route.responseTypeName : undefined,
    ])
        .filter((typeName): typeName is string => Boolean(typeName))
        .filter((typeName) => !config.builtinTypeNames.has(typeName))
        .filter((typeName) => !externalTypeNames.has(typeName)));

    const importLines = [
        `import { customInstance } from '${customInstanceImport}';`,
        usesFormatPath ? `import { formatPath } from './http';` : undefined,
        getExternalTypeImportLines(externalImports),
        localTypeNames.length > 0
            ? `import type { ${localTypeNames.join(', ')} } from '${MODELS_BARREL_IMPORT}';`
            : undefined,
    ].filter(Boolean).join('\n');

    const methods = controller.routes.map(writeRouteMethod).join('\n');

    const content = `${GENERATED_HEADER}${importLines}

export const ${controller.name} = {
${methods}
};
`;

    await writeFile(
        path.join(config.outputDir, `${controller.fileBaseName}.client.ts`),
        content,
        'utf8',
    );
}

function writeRouteMethod(route: RouteModel): string {
    const args = route.clientArgs.map(formatClientArg).join(', ');
    const uploadArg = route.clientArgs.find((arg) => arg.source === 'upload')?.name;
    const queryArg = route.clientArgs.find((arg) => arg.source === 'query')?.name;
    const bodyArg = route.clientArgs.find((arg) => arg.source === 'body')?.name;

    const configLines = [
        `method: '${route.method.toUpperCase()}',`,
        `url: ${buildFormatPathExpression(route)},`,
        queryArg ? `params: ${queryArg},` : undefined,
        uploadArg ? 'data: formData,' : bodyArg ? `data: ${bodyArg},` : undefined,
        route.binaryResponse ? `responseType: 'blob',` : undefined,
    ].filter(Boolean);

    const configBlock = configLines.map((line) => `        ${line}`).join('\n');

    if (uploadArg) {
        return `    ${route.name}: (${args}) => {
        const formData = new FormData();
        formData.append('file', ${uploadArg});
        return customInstance<${route.responseTypeName}>({
${configBlock}
        });
    },`;
    }

    return `    ${route.name}: (${args}) => customInstance<${route.responseTypeName}>({
${configBlock}
    }),`;
}

function formatClientArg(arg: ClientArgModel): string {
    const optional = arg.optional ? '?' : '';
    return `${arg.name}${optional}: ${arg.typeText}`;
}

function buildFormatPathExpression(route: RouteModel): string {
    const pathArgs = route.clientArgs.filter((arg) => arg.source === 'params');
    if (pathArgs.length === 0) {
        return `'${route.fullPath}'`;
    }

    const objectArg = pathArgs.find((arg) => arg.paramStyle === 'object');
    if (objectArg) {
        return `formatPath('${route.fullPath}', ${objectArg.name})`;
    }

    const fieldNames = pathArgs.map((arg) => arg.name).join(', ');
    return `formatPath('${route.fullPath}', { ${fieldNames} })`;
}

async function writeBarrelFiles(appModel: AppModel, outputDir: string): Promise<void> {
    const clientExports = [
        GENERATED_HEADER.trimEnd(),
        ...appModel.controllers.map((controller) => `export * from './${controller.fileBaseName}.client';`),
        '',
    ].join('\n');

    const modelsBarrelLines = [
        GENERATED_HEADER.trimEnd(),
        appModel.commonModelSourceText ? "export * from './common.models';" : undefined,
        ...appModel.controllers
            .filter((controller) => controller.hasModelFile)
            .map((controller) => `export * from './${controller.fileBaseName}.models';`),
        '',
    ].filter((line): line is string => Boolean(line));

    await Promise.all([
        writeFile(path.join(outputDir, 'index.ts'), clientExports, 'utf8'),
        writeFile(path.join(outputDir, 'models', 'index.ts'), modelsBarrelLines.join('\n'), 'utf8'),
    ]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectDtoSchemaImports(dtos: LocalDtoModel[]): string | undefined {
    if (dtos.length === 0) return undefined;

    const byModule = new Map<string, Set<string>>();
    dtos.forEach((dto) => {
        const set = byModule.get(dto.schemaModuleSpecifier) ?? new Set<string>();
        set.add(dto.schemaName);
        byModule.set(dto.schemaModuleSpecifier, set);
    });

    const schemaImports = Array.from(byModule).map(([moduleSpecifier, names]) => (
        `import { ${Array.from(names).sort().join(', ')} } from '${moduleSpecifier}';`
    ));

    return [
        `import type { z } from 'zod';`,
        ...schemaImports,
    ].join('\n');
}

function collectResponseModelTypeNames(route: RouteModel): string[] {
    if (!route.responseTypeText) return [];
    return route.referencedTypeNames;
}

function getClientExternalTypeImports(controller: ControllerModel): ExternalTypeImportModel[] {
    return uniqueExternalTypeImports(controller.routes.flatMap((route) => {
        const clientTypeTexts = route.clientArgs.map((arg) => arg.typeText);
        if (!route.responseTypeText) {
            clientTypeTexts.push(route.responseTypeName);
        }
        return filterExternalImportsByText(route.externalTypeImports, clientTypeTexts.join('\n'));
    }));
}

function filterExternalImportsByText(
    items: ExternalTypeImportModel[],
    text: string,
): ExternalTypeImportModel[] {
    return items.filter((item) => new RegExp(`\\b${escapeRegExp(item.typeName)}\\b`, 'u').test(text));
}

function filterExternalImportsByTypeNames(
    items: ExternalTypeImportModel[],
    typeNames: string[],
): ExternalTypeImportModel[] {
    const set = new Set(typeNames);
    return items.filter((item) => set.has(item.typeName));
}

function getExternalTypeImportLines(items: ExternalTypeImportModel[]): string | undefined {
    if (items.length === 0) return undefined;

    const byModule = new Map<string, Set<string>>();
    uniqueExternalTypeImports(items).forEach(({ moduleSpecifier, typeName }) => {
        const names = byModule.get(moduleSpecifier) ?? new Set<string>();
        names.add(typeName);
        byModule.set(moduleSpecifier, names);
    });

    return Array.from(byModule)
        .map(([moduleSpecifier, names]) => (
            `import type { ${Array.from(names).sort().join(', ')} } from '${moduleSpecifier}';`
        ))
        .join('\n');
}

function uniqueExternalTypeImports(items: ExternalTypeImportModel[]): ExternalTypeImportModel[] {
    const seen = new Set<string>();
    return items.filter((item) => {
        const key = `${item.moduleSpecifier}:${item.typeName}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function getRelativeImport(fromDir: string, toPath: string): string {
    return toImportPath(path.relative(fromDir, toPath));
}

function isSimpleIdentifier(name: string): boolean {
    return /^[A-Za-z_$][\w$]*$/u.test(name);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function unique<T>(values: T[]): T[] {
    return Array.from(new Set(values));
}
