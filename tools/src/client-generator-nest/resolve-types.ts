import path from 'path';
import { existsSync, readFileSync } from 'fs';
import {
    type ClassDeclaration,
    type Identifier,
    Node,
    type SourceFile,
} from 'ts-morph';
import type { ExternalTypeImportModel, LocalDtoModel, NormalizedConfig } from './types.js';

const TYPE_NAME_PATTERN = /\b[A-Z][A-Za-z0-9_]*\b/gu;

/**
 * Снимает внешний `Promise<...>`. Текстовая операция, как у старого генератора.
 * Используется, когда у Nest-метода тип возврата — `Promise<X>` (любой async-метод).
 */
export function unwrapPromise(typeText: string): string {
    const s = typeText.trim();
    if (!s.startsWith('Promise')) return s;
    const lt = s.indexOf('<');
    if (lt < 0) return s;
    let depth = 0;
    for (let i = lt; i < s.length; i += 1) {
        if (s[i] === '<') depth += 1;
        if (s[i] === '>') {
            depth -= 1;
            if (depth === 0) return s.slice(lt + 1, i).trim();
        }
    }
    return s;
}

/**
 * TS-инференция часто возвращает типы в форме `import("path/to/pkg").TypeName`.
 * Превращаем в чистый `TypeName` и собираем внешние импорты.
 */
export function normalizeGeneratedTypeText(typeText: string): {
    typeText: string;
    externalTypeImports: ExternalTypeImportModel[];
} {
    const externalTypeImports: ExternalTypeImportModel[] = [];
    const normalizedTypeText = typeText.replace(
        /import\("([^"]+)"\)\.([A-Za-z_$][\w$]*)/gu,
        (match, importPath: string, typeName: string) => {
            const moduleSpecifier = resolvePackageModuleSpecifier(importPath);

            if (!moduleSpecifier) {
                return match;
            }

            externalTypeImports.push({ moduleSpecifier, typeName });
            return typeName;
        },
    );

    return {
        typeText: normalizedTypeText,
        externalTypeImports: uniqueExternalTypeImports(externalTypeImports),
    };
}

function resolvePackageModuleSpecifier(importPath: string): string | undefined {
    const normalizedPath = path.resolve(decodeImportPath(importPath));
    const packageJsonPath = findPackageJson(path.dirname(normalizedPath));

    if (!packageJsonPath) {
        return undefined;
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: unknown };
    return typeof packageJson.name === 'string' ? packageJson.name : undefined;
}

function decodeImportPath(importPath: string): string {
    try {
        return JSON.parse(`"${importPath}"`) as string;
    } catch {
        return importPath;
    }
}

function findPackageJson(startDir: string): string | undefined {
    let currentDir = path.resolve(startDir);

    while (true) {
        const packageJsonPath = path.join(currentDir, 'package.json');
        if (existsSync(packageJsonPath)) {
            return packageJsonPath;
        }

        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
            return undefined;
        }
        currentDir = parentDir;
    }
}

export function uniqueExternalTypeImports(items: ExternalTypeImportModel[]): ExternalTypeImportModel[] {
    const seen = new Set<string>();
    return items.filter((item) => {
        const key = `${item.moduleSpecifier}:${item.typeName}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Когда ts-morph печатает тип, импортированный в текущем файле, он опускает `import(...)`
 * и оставляет только имя. Этот хелпер заполняет пробел, сканируя import-декларации.
 */
export function collectExternalImportsFromSourceFile(
    typeText: string,
    sourceFile: SourceFile,
    builtinTypeNames: Set<string>,
): ExternalTypeImportModel[] {
    const typeNames = collectTypeNames([typeText], builtinTypeNames);
    return typeNames.flatMap((typeName) => {
        for (const importDeclaration of sourceFile.getImportDeclarations()) {
            const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
            if (moduleSpecifier.startsWith('.')) continue;

            const isImported = importDeclaration.getNamedImports().some((importSpecifier) => (
                (importSpecifier.getAliasNode()?.getText() ?? importSpecifier.getName()) === typeName
            ));

            if (isImported) {
                return [{ moduleSpecifier, typeName }];
            }
        }
        return [];
    });
}

export function collectTypeNames(
    typeTexts: Array<string | undefined>,
    builtinTypeNames: Set<string>,
): string[] {
    const names = typeTexts.flatMap((typeText) => Array.from(typeText?.matchAll(TYPE_NAME_PATTERN) ?? [])
        .map((match) => match[0])
        .filter((typeName) => !builtinTypeNames.has(typeName)));

    return Array.from(new Set(names));
}

export function isReusableTypeReference(typeText: string): boolean {
    return /^[A-Z][A-Za-z0-9_]*(\.[A-Z][A-Za-z0-9_]*)?$/u.test(typeText);
}

export function isFullyExternalTypeExpression(
    typeText: string,
    externalTypeImports: ExternalTypeImportModel[],
    builtinTypeNames: Set<string>,
): boolean {
    const typeNames = collectTypeNames([typeText], builtinTypeNames);
    if (typeNames.length === 0) return false;

    const externalNames = new Set(externalTypeImports.map((imp) => imp.typeName));
    return typeNames.every((name) => externalNames.has(name));
}

export type DtoResolution =
    | { kind: 'schema'; dto: LocalDtoModel }
    | { kind: 'not-dto'; reason: string }
    | { kind: 'invalid'; reason: string };

/**
 * Разрешает имя типа параметра (например, `CreateOrderDto`) как DTO-класс back-nest:
 * ищет `extends createZodDto(<Identifier>)`, проверяет импорт схемы из `@miracle/types`,
 * возвращает имя схемы и module specifier.
 *
 * Возвращает:
 *   - `schema`  — корректный DTO с схемой из `@miracle/types`. Эмитим как `interface … extends z.infer<...>`.
 *   - `not-dto` — это не DTO-класс (нет `extends createZodDto`). Не ошибка, fallback на другую ветку.
 *   - `invalid` — DTO-класс, но схема нарушает контракт (inline, локальная, и т.п.). Ошибка/warning.
 */
export function resolveDto(
    classDecl: ClassDeclaration,
): DtoResolution {
    const extendsClause = classDecl.getExtends();
    if (!extendsClause) {
        return { kind: 'not-dto', reason: `${classDecl.getName() ?? '<anonymous>'} has no extends clause` };
    }

    const expression = extendsClause.getExpression();
    if (!Node.isCallExpression(expression)) {
        return { kind: 'not-dto', reason: 'extends expression is not a call' };
    }

    const callee = expression.getExpression();
    const calleeName = Node.isIdentifier(callee)
        ? callee.getText()
        : Node.isPropertyAccessExpression(callee)
            ? callee.getName()
            : undefined;

    if (calleeName !== 'createZodDto') {
        return { kind: 'not-dto', reason: `extends is ${calleeName ?? '<expr>'}, expected createZodDto` };
    }

    const args = expression.getArguments();
    if (args.length === 0) {
        return { kind: 'invalid', reason: 'createZodDto() called without arguments' };
    }

    const schemaArg = args[0];
    if (!Node.isIdentifier(schemaArg)) {
        return {
            kind: 'invalid',
            reason: 'createZodDto must receive an identifier (inline schema is not supported, see dto.md)',
        };
    }

    const schemaName = schemaArg.getText();
    const schemaSource = resolveSchemaImport(schemaArg, classDecl.getSourceFile());

    if (!schemaSource) {
        return {
            kind: 'invalid',
            reason: `schema "${schemaName}" must be imported from "@miracle/types" (see dto.md, rule 1)`,
        };
    }

    if (!isMiracleTypesSpecifier(schemaSource)) {
        return {
            kind: 'invalid',
            reason: `schema "${schemaName}" is imported from "${schemaSource}", expected "@miracle/types" (see dto.md, rule 1)`,
        };
    }

    return {
        kind: 'schema',
        dto: {
            name: classDecl.getName() ?? schemaName,
            schemaName,
            schemaModuleSpecifier: schemaSource,
        },
    };
}

function resolveSchemaImport(identifier: Identifier, sourceFile: SourceFile): string | undefined {
    for (const importDeclaration of sourceFile.getImportDeclarations()) {
        for (const named of importDeclaration.getNamedImports()) {
            const local = named.getAliasNode()?.getText() ?? named.getName();
            if (local === identifier.getText()) {
                return importDeclaration.getModuleSpecifierValue();
            }
        }
    }
    return undefined;
}

function isMiracleTypesSpecifier(moduleSpecifier: string): boolean {
    return moduleSpecifier === '@miracle/types' || moduleSpecifier.startsWith('@miracle/types/');
}

/**
 * Резолвит имя типа параметра в `ClassDeclaration` (если это класс) в том же или другом файле.
 * Используется для DTO-резолва: тип `CreateOrderDto` указывает на класс в файле `dto/create-order.dto.ts`.
 */
export function resolveClassDeclaration(
    typeName: string,
    sourceFile: SourceFile,
): ClassDeclaration | undefined {
    const local = sourceFile.getClass(typeName);
    if (local) return local;

    for (const importDeclaration of sourceFile.getImportDeclarations()) {
        const namedImport = importDeclaration.getNamedImports().find((spec) => (
            (spec.getAliasNode()?.getText() ?? spec.getName()) === typeName
        ));
        if (!namedImport) continue;

        const targetFile = importDeclaration.getModuleSpecifierSourceFile();
        if (!targetFile) continue;

        const found = targetFile.getClass(namedImport.getName());
        if (found) return found;
    }

    return undefined;
}

export function isStrictlyConsumerPathInWorkspace(filePath: string, workspaceRoot: string): boolean {
    const resolved = path.resolve(filePath);
    const root = path.resolve(workspaceRoot);
    return resolved.startsWith(root) && !resolved.includes(`${path.sep}node_modules${path.sep}`);
}
