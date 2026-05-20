import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { toPascalCase } from '../client-generator/naming.js';
import type {
    BackendValidationModel,
    FieldParserKind,
    FieldParserModel,
    NormalizedBackendValidationGeneratorConfig,
    RouteValidationModel,
    ValidationSource,
} from './types.js';

export async function writeBackendValidation(
    model: BackendValidationModel,
    config: NormalizedBackendValidationGeneratorConfig,
): Promise<void> {
    await mkdir(config.outputDir, { recursive: true });

    await Promise.all([
        writeParsers(model.routes, config),
        writeValidationMap(model.routes, config.outputDir),
    ]);
}

function writeParsers(
    routes: RouteValidationModel[],
    config: NormalizedBackendValidationGeneratorConfig,
): Promise<void> {
    const parserFunctions = routes.flatMap((route) => [
        route.query ? writeParserFunction(route, 'query', route.query) : undefined,
        route.params ? writeParserFunction(route, 'params', route.params) : undefined,
    ]).filter((parser): parser is string => Boolean(parser));
    const content = parserFunctions.length === 0
        ? `${GENERATED_HEADER}export {};
`
        : `${GENERATED_HEADER}import { ParseError } from '${getParseErrorImport(config)}';

${PARSER_HELPERS}

${parserFunctions.join('\n\n')}
`;

    return writeFile(path.join(config.outputDir, 'parsers.generated.ts'), content, 'utf8');
}

function writeValidationMap(routes: RouteValidationModel[], outputDir: string): Promise<void> {
    const parserNames = routes.flatMap((route) => [
        route.query ? getParserName(route, 'query') : undefined,
        route.params ? getParserName(route, 'params') : undefined,
    ]).filter((parserName): parserName is string => Boolean(parserName));
    const imports = parserNames.length > 0
        ? `import {
${parserNames.map((parserName) => `    ${parserName},`).join('\n')}
} from './parsers.generated.js';

`
        : '';
    const entries = routes.map((route) => {
        const validators = [
            route.query ? `query: ${getParserName(route, 'query')}` : undefined,
            route.params ? `params: ${getParserName(route, 'params')}` : undefined,
        ].filter(Boolean).join(', ');

        return `    '${route.method.toUpperCase()} ${route.fullPath}': { ${validators} },`;
    }).join('\n');
    const content = `${GENERATED_HEADER}${imports}export const validationMap: Record<string, {
    query?: (raw: Record<string, unknown>) => unknown;
    params?: (raw: Record<string, unknown>) => unknown;
}> = {
${entries}
};
`;

    return writeFile(path.join(outputDir, 'validation-map.generated.ts'), content, 'utf8');
}

function writeParserFunction(
    route: RouteValidationModel,
    source: ValidationSource,
    fields: FieldParserModel[],
): string {
    const parserName = getParserName(route, source);
    const lines = fields.flatMap((field) => writeFieldParser(field));

    return `export function ${parserName}(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

${lines.map((line) => `    ${line}`).join('\n')}

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}`;
}

function writeFieldParser(field: FieldParserModel): string[] {
    const fieldLiteral = JSON.stringify(field.name);
    const rawName = `raw_${sanitizeIdentifier(field.name)}`;
    const lines = [
        `const ${rawName} = readSingleValue(raw, ${fieldLiteral});`,
        `if (${rawName}.missing) {`,
    ];

    if (field.optional) {
        lines.push(`    result[${fieldLiteral}] = undefined;`);
    } else {
        lines.push(`    errors.push({ field: ${fieldLiteral}, message: 'is required' });`);
    }

    lines.push(`} else if (${rawName}.multi) {`);
    lines.push(`    errors.push({ field: ${fieldLiteral}, message: 'expected single value' });`);
    lines.push('} else {');
    lines.push(...writeValueParser(field, rawName).map((line) => `    ${line}`));
    lines.push('}');

    return lines;
}

function writeValueParser(field: FieldParserModel, rawName: string): string[] {
    const fieldLiteral = JSON.stringify(field.name);
    const value = `${rawName}.value`;

    switch (field.parser.kind) {
        case 'string':
            return [
                `if (typeof ${value} !== 'string') {`,
                `    errors.push({ field: ${fieldLiteral}, message: 'expected string' });`,
                '} else {',
                `    result[${fieldLiteral}] = ${value};`,
                '}',
            ];
        case 'number':
            return [
                `const parsed = parseNumber(${value});`,
                'if (parsed === undefined) {',
                `    errors.push({ field: ${fieldLiteral}, message: 'expected number' });`,
                '} else {',
                `    result[${fieldLiteral}] = parsed;`,
                '}',
            ];
        case 'boolean':
            return [
                `const parsed = parseBoolean(${value});`,
                'if (parsed === undefined) {',
                `    errors.push({ field: ${fieldLiteral}, message: 'expected boolean' });`,
                '} else {',
                `    result[${fieldLiteral}] = parsed;`,
                '}',
            ];
        case 'literalUnion':
            return writeLiteralUnionParser(field, rawName, field.parser);
    }
}

function writeLiteralUnionParser(
    field: FieldParserModel,
    rawName: string,
    parser: Extract<FieldParserKind, { kind: 'literalUnion' }>,
): string[] {
    const fieldLiteral = JSON.stringify(field.name);
    const literals = JSON.stringify(parser.literals);
    const expected = parser.literals.map(String).join(', ');

    return [
        `const parsed = parseLiteral(${rawName}.value, ${literals});`,
        'if (parsed === undefined) {',
        `    errors.push({ field: ${fieldLiteral}, message: ${JSON.stringify(`expected one of: ${expected}`)} });`,
        '} else {',
        `    result[${fieldLiteral}] = parsed;`,
        '}',
    ];
}

function getParserName(route: RouteValidationModel, source: ValidationSource): string {
    return `parse${toPascalCase(route.routeName)}${toPascalCase(source)}`;
}

function sanitizeIdentifier(value: string): string {
    const identifier = value.replace(/[^a-zA-Z0-9_$]/gu, '_');
    return /^[a-zA-Z_$]/u.test(identifier) ? identifier : `_${identifier}`;
}

function getParseErrorImport(config: NormalizedBackendValidationGeneratorConfig): string {
    const backendSrcDir = path.dirname(config.inputPath);
    const parseErrorPath = path.join(backendSrcDir, 'app', 'errors.ts');
    return toBackendImportPath(path.relative(config.outputDir, parseErrorPath));
}

function toBackendImportPath(value: string): string {
    const normalized = value.replace(/\\/gu, '/').replace(/\.(ts|tsx)$/u, '.js');
    return normalized.startsWith('.') ? normalized : `./${normalized}`;
}

const GENERATED_HEADER = `/* eslint-disable */
// Файл сгенерирован @miracle/tools backend-validation-generator. Не редактировать вручную.

`;

const PARSER_HELPERS = `function readSingleValue(raw: Record<string, unknown>, field: string) {
    const value = raw[field];

    return {
        value,
        missing: value === undefined,
        multi: Array.isArray(value),
    };
}

function parseNumber(value: unknown): number | undefined {
    if (typeof value === 'number') {
        return Number.isNaN(value) ? undefined : value;
    }

    if (typeof value !== 'string' || value.trim() === '') {
        return undefined;
    }

    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
}

function parseBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') {
        return value;
    }

    if (value === 'true') {
        return true;
    }

    if (value === 'false') {
        return false;
    }

    return undefined;
}

function parseLiteral(value: unknown, literals: Array<string | number | boolean>): string | number | boolean | undefined {
    return literals.find((literal) => {
        if (typeof literal === 'number') {
            return parseNumber(value) === literal;
        }

        if (typeof literal === 'boolean') {
            return parseBoolean(value) === literal;
        }

        return value === literal;
    });
}`;
