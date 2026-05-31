import path from 'path';
import {
    type ArrayLiteralExpression,
    type ClassDeclaration,
    type Decorator,
    type Identifier,
    type MethodDeclaration,
    Node,
    type ObjectLiteralExpression,
    Project,
    type SourceFile,
    SyntaxKind,
    TypeFormatFlags,
    type EnumDeclaration,
    type InterfaceDeclaration,
    type TypeAliasDeclaration,
    type ImportDeclaration,
} from 'ts-morph';
import { controllerBasename, normalizeUrl, stripSuffix, toPascalCase } from './naming.js';
import { parseMethodParams } from './parse-params.js';
import {
    collectExternalImportsFromSourceFile,
    collectTypeNames,
    isFullyExternalTypeExpression,
    isReusableTypeReference,
    normalizeGeneratedTypeText,
    resolveClassDeclaration,
    resolveDto,
    uniqueExternalTypeImports,
    unwrapPromise,
} from './resolve-types.js';
import type {
    AppModel,
    ClientArgModel,
    ControllerModel,
    ExternalTypeImportModel,
    HttpMethod,
    LocalDtoModel,
    NormalizedConfig,
    RouteModel,
} from './types.js';

const HTTP_METHOD_DECORATORS: Record<string, HttpMethod> = {
    Get: 'get',
    Post: 'post',
    Put: 'put',
    Patch: 'patch',
    Delete: 'delete',
    Options: 'options',
    Head: 'head',
};

export function extractAppModel(config: NormalizedConfig): AppModel {
    const project = new Project({
        tsConfigFilePath: config.tsConfigPath,
    });

    const appModuleFile = project.getSourceFileOrThrow(config.inputPath);
    const appModuleClass = findModuleClass(appModuleFile);
    if (!appModuleClass) {
        throw new Error(`No @Module class found in ${config.inputPath}`);
    }

    const controllerClasses = collectControllerClasses(appModuleClass);
    const controllers: ControllerModel[] = [];
    const controllerSourceByPath = new Map<string, SourceFile>();

    for (const classDecl of controllerClasses) {
        const controller = extractController(classDecl, config);
        if (controller) {
            controllers.push(controller);
            controllerSourceByPath.set(controller.sourceFilePath, classDecl.getSourceFile());
        }
    }

    const commonModels = collectCommonModels(controllers, controllerSourceByPath, config);

    controllers.forEach((controller) => {
        const controllerTypeNames = new Set([
            ...controller.routes.flatMap((route) => route.referencedTypeNames),
            ...collectTypeNames([controller.modelSourceText], config.builtinTypeNames),
        ]);
        controller.commonTypeNames = commonModels.typeNames.filter((typeName) => controllerTypeNames.has(typeName));
    });

    return {
        controllers,
        commonModelSourceText: commonModels.sourceText,
        commonTypeNames: commonModels.typeNames,
    };
}

// ---------------------------------------------------------------------------
// AppModule walk
// ---------------------------------------------------------------------------

function collectControllerClasses(appModuleClass: ClassDeclaration): ClassDeclaration[] {
    const moduleClasses = collectImportedModuleClasses(appModuleClass);
    const seen = new Set<string>();
    const controllers: ClassDeclaration[] = [];

    for (const moduleClass of [appModuleClass, ...moduleClasses]) {
        const moduleDecorator = moduleClass.getDecorator('Module');
        if (!moduleDecorator) continue;

        const optionsObject = getDecoratorOptions(moduleDecorator);
        if (!optionsObject) continue;

        const controllersArray = getObjectArrayProperty(optionsObject, 'controllers');
        if (!controllersArray) continue;

        for (const element of controllersArray.getElements()) {
            const identifier = unwrapForwardRef(element);
            if (!identifier) continue;

            const classDecl = resolveClassByIdentifier(identifier);
            if (!classDecl) {
                console.warn(`[client-generator-nest] cannot resolve controller "${identifier.getText()}" in module "${moduleClass.getName() ?? '<anonymous>'}"`);
                continue;
            }

            const key = `${classDecl.getSourceFile().getFilePath()}::${classDecl.getName()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            controllers.push(classDecl);
        }
    }

    return controllers;
}

function collectImportedModuleClasses(appModuleClass: ClassDeclaration): ClassDeclaration[] {
    const moduleDecorator = appModuleClass.getDecorator('Module');
    if (!moduleDecorator) return [];

    const optionsObject = getDecoratorOptions(moduleDecorator);
    if (!optionsObject) return [];

    const importsArray = getObjectArrayProperty(optionsObject, 'imports');
    if (!importsArray) return [];

    const result: ClassDeclaration[] = [];
    for (const element of importsArray.getElements()) {
        const identifier = unwrapForwardRef(element);
        if (!identifier) {
            // ConfigModule.forRoot({...}) и подобные — пропускаем без шума:
            // у dynamic-модулей контроллеров нет, они обычно глобальные провайдеры.
            continue;
        }

        const classDecl = resolveClassByIdentifier(identifier);
        if (classDecl) {
            result.push(classDecl);
        }
    }
    return result;
}

function findModuleClass(file: SourceFile): ClassDeclaration | undefined {
    return file.getClasses().find((cls) => cls.getDecorator('Module'));
}

function getDecoratorOptions(decorator: Decorator): ObjectLiteralExpression | undefined {
    const arg = decorator.getArguments()[0];
    return Node.isObjectLiteralExpression(arg) ? arg : undefined;
}

function getObjectArrayProperty(
    object: ObjectLiteralExpression,
    propertyName: string,
): ArrayLiteralExpression | undefined {
    const property = object.getProperty(propertyName);
    if (!property || !Node.isPropertyAssignment(property)) return undefined;
    const init = property.getInitializer();
    return Node.isArrayLiteralExpression(init) ? init : undefined;
}

/**
 * Из элемента массива `imports`/`controllers` извлекает Identifier модуля/контроллера.
 * Поддерживает простой `Identifier`, `forwardRef(() => Identifier)` (с warning), пропускает
 * `Module.forRoot(...)` и прочие CallExpression на провайдерах.
 */
function unwrapForwardRef(element: Node): Identifier | undefined {
    if (Node.isIdentifier(element)) return element;

    if (Node.isCallExpression(element)) {
        const callee = element.getExpression();
        if (Node.isIdentifier(callee) && callee.getText() === 'forwardRef') {
            const arrow = element.getArguments()[0];
            if (Node.isArrowFunction(arrow) || Node.isFunctionExpression(arrow)) {
                const body = arrow.getBody();
                if (Node.isIdentifier(body)) return body;
            }
            console.warn('[client-generator-nest] forwardRef without a clean identifier; skipping');
        }
    }

    return undefined;
}

function resolveClassByIdentifier(identifier: Identifier): ClassDeclaration | undefined {
    const symbol = identifier.getSymbol();
    const aliased = symbol?.getAliasedSymbol() ?? symbol;
    const declarations = aliased?.getDeclarations() ?? [];

    for (const declaration of declarations) {
        if (Node.isClassDeclaration(declaration)) return declaration;
    }
    return undefined;
}

// ---------------------------------------------------------------------------
// Controller / Route
// ---------------------------------------------------------------------------

function extractController(classDecl: ClassDeclaration, config: NormalizedConfig): ControllerModel | undefined {
    const decorator = classDecl.getDecorator('Controller');
    if (!decorator) return undefined;

    const prefix = readControllerPrefix(decorator);
    const className = classDecl.getName();
    if (!className) {
        throw new Error(`Controller class without a name in ${classDecl.getSourceFile().getFilePath()}`);
    }

    const routes: RouteModel[] = [];
    const localDtos = new Map<string, LocalDtoModel>();

    for (const method of classDecl.getMethods()) {
        const route = extractRoute(method, prefix, classDecl, config, localDtos);
        if (route) routes.push(route);
    }

    if (routes.length === 0) {
        return undefined;
    }

    const sourceFile = classDecl.getSourceFile();
    const fileBaseName = controllerBasename(className);
    const referencedTypeNames = Array.from(new Set(routes.flatMap((route) => route.referencedTypeNames)));
    const modelSourceText = getLocalDeclarationsSourceText(sourceFile, referencedTypeNames, localDtos, config);

    return {
        className,
        name: fileBaseName,
        fileBaseName,
        prefix,
        sourceFilePath: sourceFile.getFilePath(),
        routes,
        localDtos: Array.from(localDtos.values()),
        modelSourceText,
        commonTypeNames: [],
        hasModelFile: Boolean(modelSourceText) || routes.some((route) => Boolean(route.responseTypeText)),
    };
}

function readControllerPrefix(decorator: Decorator): string {
    const arg = decorator.getArguments()[0];
    if (!arg) return '';

    if (Node.isStringLiteral(arg)) return arg.getLiteralText();

    if (Node.isObjectLiteralExpression(arg)) {
        if (hasObjectProperty(arg, 'version')) {
            throw new Error(`@Controller({ version }) is not supported by client-generator-nest. Remove "version".`);
        }
        const pathProperty = arg.getProperty('path');
        if (pathProperty && Node.isPropertyAssignment(pathProperty)) {
            const init = pathProperty.getInitializer();
            if (init && Node.isStringLiteral(init)) return init.getLiteralText();
            if (init && Node.isArrayLiteralExpression(init)) {
                const first = init.getElements()[0];
                if (first && Node.isStringLiteral(first)) return first.getLiteralText();
                throw new Error('@Controller path must be a string literal (array forms are not supported).');
            }
        }
        return '';
    }

    return '';
}

function hasObjectProperty(object: ObjectLiteralExpression, propertyName: string): boolean {
    return Boolean(object.getProperty(propertyName));
}

function extractRoute(
    method: MethodDeclaration,
    controllerPrefix: string,
    classDecl: ClassDeclaration,
    config: NormalizedConfig,
    localDtos: Map<string, LocalDtoModel>,
): RouteModel | undefined {
    if (method.hasModifier(SyntaxKind.PrivateKeyword) || method.hasModifier(SyntaxKind.ProtectedKeyword)) {
        return undefined;
    }

    const httpDecoratorEntry = findHttpDecorator(method);
    if (!httpDecoratorEntry) return undefined;

    const { decorator: httpDecorator, httpMethod } = httpDecoratorEntry;
    const methodPath = firstStringArg(httpDecorator) ?? '';
    const operationName = method.getName();
    const contextLabel = `${classDecl.getName() ?? '<anonymous>'}.${operationName}`;

    const { clientArgs, externalTypeImports: paramExternalImports } = parseMethodParams(
        method.getParameters(),
        config.builtinTypeNames,
        { contextLabel },
    );

    registerDtosForArgs(clientArgs, classDecl.getSourceFile(), localDtos, config, contextLabel);

    const binaryResponse = hasBinaryResponse(method);
    const response = resolveResponseType(method, classDecl, config, binaryResponse);

    const externalTypeImports = uniqueExternalTypeImports([
        ...paramExternalImports,
        ...response.externalTypeImports,
    ]);

    const referencedTypeNames = collectTypeNames(
        [
            ...clientArgs.map((arg) => arg.typeText),
            response.typeName,
            response.typeText,
        ],
        config.builtinTypeNames,
    );

    return {
        name: operationName,
        method: httpMethod,
        path: methodPath,
        fullPath: normalizeUrl(controllerPrefix, methodPath),
        hasRequest: clientArgs.length > 0,
        clientArgs,
        responseTypeName: response.typeName,
        responseTypeText: response.typeText,
        externalTypeImports,
        referencedTypeNames,
        hasBody: clientArgs.some((arg) => arg.source === 'body'),
        hasQuery: clientArgs.some((arg) => arg.source === 'query'),
        hasParams: clientArgs.some((arg) => arg.source === 'params'),
        binaryResponse,
    };
}

function findHttpDecorator(method: MethodDeclaration): { decorator: Decorator; httpMethod: HttpMethod } | undefined {
    for (const decorator of method.getDecorators()) {
        const httpMethod = HTTP_METHOD_DECORATORS[decorator.getName()];
        if (httpMethod) return { decorator, httpMethod };
    }
    return undefined;
}

function firstStringArg(decorator: Decorator): string | undefined {
    const arg = decorator.getArguments()[0];
    if (arg && Node.isStringLiteral(arg)) return arg.getLiteralText();
    return undefined;
}

// ---------------------------------------------------------------------------
// DTO registration
// ---------------------------------------------------------------------------

function registerDtosForArgs(
    args: ClientArgModel[],
    controllerFile: SourceFile,
    localDtos: Map<string, LocalDtoModel>,
    config: NormalizedConfig,
    contextLabel: string,
): void {
    for (const arg of args) {
        // Только простые имена-идентификаторы могут быть DTO-классами.
        // Inline-типы (`{ x: string }`), generic (`Stored<User>`) и т.п. — обходим: они либо
        // workspace-типы (резолвятся через externalTypeImports), либо локальные алиасы.
        if (!isReusableTypeReference(arg.typeText)) continue;

        const typeName = arg.typeText.split('.').at(-1);
        if (!typeName) continue;
        if (localDtos.has(typeName)) continue;

        const classDecl = resolveClassDeclaration(typeName, controllerFile);
        if (!classDecl) continue;

        const resolution = resolveDto(classDecl);
        if (resolution.kind === 'schema') {
            localDtos.set(typeName, resolution.dto);
            continue;
        }
        if (resolution.kind === 'invalid') {
            const message = `[client-generator-nest] ${contextLabel}: DTO "${typeName}" — ${resolution.reason}`;
            if (config.strictTypes) {
                throw new Error(message);
            }
            console.warn(message);
        }
        // not-dto: класс есть, но это не DTO — будет обработан общей веткой (копирование).
    }
}

// ---------------------------------------------------------------------------
// Response resolution
// ---------------------------------------------------------------------------

function resolveResponseType(
    method: MethodDeclaration,
    classDecl: ClassDeclaration,
    config: NormalizedConfig,
    binaryResponse: boolean,
): {
    typeName: string;
    typeText?: string;
    externalTypeImports: ExternalTypeImportModel[];
} {
    if (binaryResponse) {
        return {
            typeName: 'Blob',
            externalTypeImports: [],
        };
    }

    const sourceFile = classDecl.getSourceFile();
    const operationTypeName = toPascalCase(method.getName());
    const className = classDecl.getName() ?? 'Controller';

    // Предпочитаем синтаксическую аннотацию (если есть) — она не содержит import("...")
    // и использует уже зарегистрированные импорты файла.
    const syntactic = method.getReturnTypeNode()?.getText();
    let typeText: string;
    let externalTypeImports: ExternalTypeImportModel[] = [];

    if (syntactic) {
        typeText = unwrapPromise(syntactic);
        externalTypeImports.push(
            ...collectExternalImportsFromSourceFile(typeText, sourceFile, config.builtinTypeNames),
        );
    } else {
        const inferredText = method.getReturnType().getText(method, TypeFormatFlags.NoTruncation);
        const unwrapped = unwrapPromise(inferredText);
        const normalized = normalizeGeneratedTypeText(unwrapped);
        typeText = normalized.typeText;
        externalTypeImports.push(...normalized.externalTypeImports);
        externalTypeImports.push(
            ...collectExternalImportsFromSourceFile(typeText, sourceFile, config.builtinTypeNames),
        );
    }

    externalTypeImports = uniqueExternalTypeImports(externalTypeImports);

    const isSimpleName = isReusableTypeReference(typeText);
    const fullyExternal = isFullyExternalTypeExpression(typeText, externalTypeImports, config.builtinTypeNames);

    if (isSimpleName || fullyExternal) {
        return {
            typeName: typeText,
            externalTypeImports,
        };
    }

    if (isInlinePrimitiveResponseType(typeText)) {
        return {
            typeName: typeText,
            externalTypeImports,
        };
    }

    const controllerName = toPascalCase(controllerBasename(className));
    return {
        typeName: `${controllerName}${operationTypeName}Response`,
        typeText,
        externalTypeImports,
    };
}

function hasBinaryResponse(method: MethodDeclaration): boolean {
    return method.getDecorators().some((decorator) => decorator.getName() === 'BinaryResponse');
}

function isInlinePrimitiveResponseType(typeText: string): boolean {
    const trimmed = typeText.trim();
    return !trimmed.startsWith('{') && !trimmed.startsWith('[');
}

// ---------------------------------------------------------------------------
// Common models + local models
// ---------------------------------------------------------------------------

function getLocalDeclarationsSourceText(
    sourceFile: SourceFile,
    referencedTypeNames: string[],
    localDtos: Map<string, LocalDtoModel>,
    config: NormalizedConfig,
): string {
    const declarations = collectLocalDeclarations(sourceFile, referencedTypeNames, localDtos);
    if (declarations.length === 0) return '';

    const declarationTexts = declarations.map((decl) => ensureExportedDeclaration(decl.getText()));
    const importedTypeNames = declarations.flatMap((decl) => collectTypeNames([decl.getText()], config.builtinTypeNames));
    const imports = getExternalImportSourceText(sourceFile, importedTypeNames);

    return [imports, declarationTexts.join('\n\n')].filter(Boolean).join('\n\n');
}

function collectLocalDeclarations(
    sourceFile: SourceFile,
    referencedTypeNames: string[],
    localDtos: Map<string, LocalDtoModel>,
): Array<TypeAliasDeclaration | InterfaceDeclaration | EnumDeclaration> {
    const collected = new Map<string, TypeAliasDeclaration | InterfaceDeclaration | EnumDeclaration>();

    const visit = (typeName: string) => {
        if (collected.has(typeName)) return;
        if (localDtos.has(typeName)) return;

        const decl =
            sourceFile.getTypeAlias(typeName) ??
            sourceFile.getInterface(typeName) ??
            sourceFile.getEnum(typeName);

        if (!decl) return;

        collected.set(typeName, decl);
        collectTypeNames([decl.getText()], new Set()).forEach(visit);
    };

    referencedTypeNames.forEach(visit);
    return Array.from(collected.values());
}

type LocalTypeDeclaration = TypeAliasDeclaration | InterfaceDeclaration | EnumDeclaration;

function collectCommonModels(
    controllers: ControllerModel[],
    controllerSourceByPath: Map<string, SourceFile>,
    config: NormalizedConfig,
): {
    sourceText: string;
    typeNames: string[];
} {
    const declarations = new Map<string, LocalTypeDeclaration>();
    const usedTypeNamesBySourceFile = new Map<SourceFile, Set<string>>();
    const controllerSourceFiles = new Set(controllers.map((c) => c.sourceFilePath));

    const collectDeclaration = (declaration: LocalTypeDeclaration) => {
        const name = declaration.getName();
        if (declarations.has(name)) return;
        declarations.set(name, declaration);

        const declarationTypeNames = collectTypeNames([declaration.getText()], config.builtinTypeNames);
        const used = usedTypeNamesBySourceFile.get(declaration.getSourceFile()) ?? new Set<string>();

        declarationTypeNames.forEach((typeName) => {
            used.add(typeName);
            const dependency = resolveLocalTypeDeclaration(declaration.getSourceFile(), typeName);

            if (!dependency || isExternalImport(declaration.getSourceFile(), typeName)) return;
            if (isWithinWorkspaceBackend(dependency, config)) {
                collectDeclaration(dependency);
            }
        });

        usedTypeNamesBySourceFile.set(declaration.getSourceFile(), used);
    };

    controllers.forEach((controller) => {
        const sourceFile = controllerSourceByPath.get(controller.sourceFilePath);
        if (!sourceFile) return;

        controller.routes.forEach((route) => {
            route.referencedTypeNames.forEach((typeName) => {
                if (controller.localDtos.some((dto) => dto.name === typeName)) return;

                const declaration = resolveLocalTypeDeclaration(sourceFile, typeName);
                if (!declaration) return;

                // Локальные декларации самого файла-контроллера остаются "per-controller".
                if (controllerSourceFiles.has(declaration.getSourceFile().getFilePath())) return;
                if (isExternalImport(sourceFile, typeName)) return;

                if (isWithinWorkspaceBackend(declaration, config)) {
                    collectDeclaration(declaration);
                }
            });
        });
    });

    const imports = Array.from(usedTypeNamesBySourceFile)
        .map(([file, used]) => getExternalImportSourceText(file, Array.from(used)))
        .filter(Boolean);
    const declarationTexts = Array.from(declarations.values()).map((decl) => ensureExportedDeclaration(decl.getText()));

    return {
        sourceText: unique([...imports, ...declarationTexts]).join('\n\n'),
        typeNames: Array.from(declarations.keys()),
    };
}

function resolveLocalTypeDeclaration(
    sourceFile: SourceFile,
    typeName: string,
): LocalTypeDeclaration | undefined {
    const local = sourceFile.getTypeAlias(typeName)
        ?? sourceFile.getInterface(typeName)
        ?? sourceFile.getEnum(typeName);
    if (local) return local;

    for (const importDeclaration of sourceFile.getImportDeclarations()) {
        const named = importDeclaration.getNamedImports().find((spec) => (
            (spec.getAliasNode()?.getText() ?? spec.getName()) === typeName
        ));
        const symbol = named?.getNameNode().getSymbol();
        const decl = symbol?.getAliasedSymbol()?.getDeclarations()[0];
        if (
            Node.isTypeAliasDeclaration(decl) ||
            Node.isInterfaceDeclaration(decl) ||
            Node.isEnumDeclaration(decl)
        ) {
            return decl;
        }
    }
    return undefined;
}

function isExternalImport(sourceFile: SourceFile, typeName: string): boolean {
    return sourceFile.getImportDeclarations().some((importDeclaration) => {
        const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
        if (moduleSpecifier.startsWith('.')) return false;

        return importDeclaration.getNamedImports().some((spec) => (
            (spec.getAliasNode()?.getText() ?? spec.getName()) === typeName
        ));
    });
}

function isWithinWorkspaceBackend(declaration: LocalTypeDeclaration, config: NormalizedConfig): boolean {
    const declarationPath = path.resolve(declaration.getSourceFile().getFilePath());
    const backendRoot = path.resolve(path.dirname(config.inputPath));
    return declarationPath.startsWith(backendRoot) && !declarationPath.includes(`${path.sep}node_modules${path.sep}`);
}

function getExternalImportSourceText(sourceFile: SourceFile, usedTypeNames: string[]): string {
    const used = new Set(usedTypeNames);
    const imports = sourceFile
        .getImportDeclarations()
        .filter((importDeclaration) => !importDeclaration.getModuleSpecifierValue().startsWith('.'))
        .filter((importDeclaration) => importDeclaration.getNamedImports().some((spec) => {
            const localName = spec.getAliasNode()?.getText() ?? spec.getName();
            return used.has(localName);
        }));

    const importTexts = imports.map((importDeclaration) => importDeclaration.getText());
    const exportTexts = imports
        .map(getExternalTypeExportText)
        .filter((text): text is string => Boolean(text));

    return unique([...importTexts, ...exportTexts]).join('\n');
}

function getExternalTypeExportText(importDeclaration: ImportDeclaration): string | undefined {
    const namedImports = importDeclaration.getNamedImports();
    if (namedImports.length === 0) return undefined;

    const names = namedImports.map((spec) => {
        const name = spec.getName();
        const alias = spec.getAliasNode()?.getText();
        return alias ? `${name} as ${alias}` : name;
    });

    return `export type { ${names.join(', ')} } from '${importDeclaration.getModuleSpecifierValue()}';`;
}

function ensureExportedDeclaration(text: string): string {
    return text.startsWith('export ') ? text : `export ${text}`;
}

function unique(values: string[]): string[] {
    return Array.from(new Set(values));
}
