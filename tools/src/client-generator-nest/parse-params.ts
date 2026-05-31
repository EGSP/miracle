import {
    type Decorator,
    Node,
    type ParameterDeclaration,
} from 'ts-morph';
import { toCamelCase } from './naming.js';
import type { ClientArgModel, ClientArgSource } from './types.js';
import {
    collectExternalImportsFromSourceFile,
    collectTypeNames,
    isReusableTypeReference,
    normalizeGeneratedTypeText,
    uniqueExternalTypeImports,
} from './resolve-types.js';
import type { ExternalTypeImportModel } from './types.js';

const HTTP_PARAM_DECORATORS = new Set(['Body', 'Query', 'Param']);
const UPLOAD_PARAM_DECORATORS = new Set(['UploadedFile']);

type ParamKind = 'body' | 'query' | 'param' | 'skip';

type ParsedParamResult = {
    clientArgs: ClientArgModel[];
    externalTypeImports: ExternalTypeImportModel[];
};

/**
 * Разбирает параметры HTTP-метода контроллера. Возвращает клиентские аргументы
 * (path-params → query → body → upload) и собранные внешние type-импорты для типов параметров.
 *
 * Игнорирует всё, что не помечено `@Body/@Query/@Param/@UploadedFile`: `@Req`, `@Res`, `@Headers`,
 * `@CurrentUser` и любые кастомные декораторы серверного назначения.
 */
export function parseMethodParams(
    parameters: ParameterDeclaration[],
    builtinTypeNames: Set<string>,
    options: { contextLabel: string },
): ParsedParamResult {
    const externalTypeImports: ExternalTypeImportModel[] = [];
    const pathArgs: ClientArgModel[] = [];
    const queryFieldArgs: ClientArgModel[] = [];
    const queryObjectArgs: ClientArgModel[] = [];
    const bodyArgs: ClientArgModel[] = [];
    const uploadArgs: ClientArgModel[] = [];

    const queryFieldEntries: Array<{ paramName: string; queryName: string; typeText: string; optional: boolean }> = [];

    for (const parameter of parameters) {
        if (findUploadDecorator(parameter)) {
            uploadArgs.push({
                source: 'upload',
                name: 'file',
                typeText: 'File',
                referencedTypeNames: [],
            });
            continue;
        }

        const httpDecorator = findHttpDecorator(parameter);
        if (!httpDecorator) continue;

        const kind = decoratorKind(httpDecorator);
        if (kind === 'skip') continue;

        const typeText = unwrapPlainType(parameter);
        const optional = isParameterOptional(parameter, typeText);
        const normalized = normalizeGeneratedTypeText(typeText);
        externalTypeImports.push(...normalized.externalTypeImports);
        externalTypeImports.push(
            ...collectExternalImportsFromSourceFile(
                normalized.typeText,
                parameter.getSourceFile(),
                builtinTypeNames,
            ),
        );

        const referencedTypeNames = collectTypeNames([normalized.typeText], builtinTypeNames);

        if (kind === 'param') {
            const decoratorArg = firstStringArg(httpDecorator);
            if (decoratorArg) {
                pathArgs.push({
                    source: 'params',
                    name: parameter.getName(),
                    typeText: normalized.typeText,
                    referencedTypeNames,
                    paramStyle: 'field',
                    optional,
                });
            } else {
                pathArgs.push({
                    source: 'params',
                    name: clientArgName('params', normalized.typeText, parameter.getName()),
                    typeText: normalized.typeText,
                    referencedTypeNames,
                    paramStyle: 'object',
                    optional,
                });
            }
            continue;
        }

        if (kind === 'body') {
            bodyArgs.push({
                source: 'body',
                name: clientArgName('body', normalized.typeText, parameter.getName()),
                typeText: normalized.typeText,
                referencedTypeNames,
            });
            continue;
        }

        // Query
        const fieldName = firstStringArg(httpDecorator);
        if (fieldName) {
            queryFieldEntries.push({
                paramName: parameter.getName(),
                queryName: fieldName,
                typeText: normalized.typeText,
                optional,
            });
        } else {
            queryObjectArgs.push({
                source: 'query',
                name: clientArgName('query', normalized.typeText, parameter.getName()),
                typeText: normalized.typeText,
                referencedTypeNames,
            });
        }
    }

    if (queryFieldEntries.length > 0 && queryObjectArgs.length > 0) {
        throw new Error(
            `${options.contextLabel}: cannot mix @Query() and @Query('field') in the same method.`,
        );
    }

    if (queryFieldEntries.length > 0) {
        const inlineTypeText = `{ ${queryFieldEntries
            .map((entry) => `${entry.queryName}${entry.optional ? '?' : ''}: ${entry.typeText}`)
            .join('; ')} }`;
        queryFieldArgs.push({
            source: 'query',
            name: 'query',
            typeText: inlineTypeText,
            referencedTypeNames: collectTypeNames([inlineTypeText], builtinTypeNames),
        });
    }

    const clientArgs = ensureUniqueArgNames([
        ...pathArgs,
        ...queryObjectArgs,
        ...queryFieldArgs,
        ...bodyArgs,
        ...uploadArgs,
    ]);

    return {
        clientArgs,
        externalTypeImports: uniqueExternalTypeImports(externalTypeImports),
    };
}

function findHttpDecorator(parameter: ParameterDeclaration): Decorator | undefined {
    return parameter.getDecorators().find((decorator) => HTTP_PARAM_DECORATORS.has(decorator.getName()));
}

function findUploadDecorator(parameter: ParameterDeclaration): Decorator | undefined {
    return parameter.getDecorators().find((decorator) => UPLOAD_PARAM_DECORATORS.has(decorator.getName()));
}

function decoratorKind(decorator: Decorator): ParamKind {
    const name = decorator.getName();
    if (name === 'Body') return 'body';
    if (name === 'Query') return 'query';
    if (name === 'Param') return 'param';
    return 'skip';
}

function firstStringArg(decorator: Decorator): string | undefined {
    const arg = decorator.getArguments()[0];
    if (arg && Node.isStringLiteral(arg)) return arg.getLiteralText();
    return undefined;
}

function isParameterOptional(parameter: ParameterDeclaration, typeText: string): boolean {
    return parameter.hasQuestionToken()
        || parameter.getInitializer() !== undefined
        || /\bundefined\b/u.test(typeText);
}

/**
 * Берёт синтаксический текст типа параметра (как написано в коде), не TS-инференцию.
 * Для DTO-классов это даёт чистое имя (`CreateOrderDto`), которое потом резолвится отдельно.
 */
function unwrapPlainType(parameter: ParameterDeclaration): string {
    const node = parameter.getTypeNode();
    if (node) return node.getText();
    return parameter.getType().getText();
}

function clientArgName(source: ClientArgSource, typeText: string, fallback: string): string {
    if (isReusableTypeReference(typeText)) {
        const last = typeText.split('.').at(-1);
        if (last) return toCamelCase(last);
    }
    if (source === 'params') return 'params';
    if (source === 'query') return 'query';
    if (source === 'body') return 'body';
    return fallback;
}

function ensureUniqueArgNames(args: ClientArgModel[]): ClientArgModel[] {
    const seen = new Map<string, number>();
    return args.map((arg) => {
        const count = seen.get(arg.name) ?? 0;
        seen.set(arg.name, count + 1);
        if (count === 0) return arg;

        const suffix = arg.source.charAt(0).toUpperCase() + arg.source.slice(1);
        return { ...arg, name: `${arg.name}${suffix}` };
    });
}
