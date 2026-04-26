import path from 'path';
import {
    ArrowFunction,
    CallExpression,
    InterfaceDeclaration,
    Node,
    Project,
    ReturnStatement,
    SatisfiesExpression,
    SourceFile,
    SyntaxKind,
    TypeAliasDeclaration,
    TypeFormatFlags,
    VariableDeclaration,
    EnumDeclaration,
    type Expression,
    type Type,
    type ImportDeclaration,
} from 'ts-morph';
import { normalizeUrl, stripSuffix, toPascalCase } from './naming.js';
import type {
    AppModel,
    HttpMethod,
    NormalizedClientGeneratorConfig,
    RouteModel,
    RouterModel,
} from './types.js';

const ROUTE_METHODS = new Set<HttpMethod>(['get', 'post', 'put', 'patch', 'delete']);
const TYPE_NAME_PATTERN = /\b[A-Z][A-Za-z0-9_]*\b/gu;
const BUILTIN_TYPE_NAMES = new Set([
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
]);
const routerSourceFilesByName = new Map<string, SourceFile>();

export function extractAppModel(config: NormalizedClientGeneratorConfig): AppModel {
    const project = new Project({
        tsConfigFilePath: config.tsConfigPath,
    });
    const entryFile = project.getSourceFileOrThrow(config.inputPath);
    const appCall = findCall(entryFile, 'defineApp');
    const routersArg = unwrapExpression(appCall.getArguments()[0]);

    if (!Node.isArrayLiteralExpression(routersArg)) {
        throw new Error('defineApp must receive an array literal.');
    }

    const routers = routersArg.getElements().map((routerElement) => {
        const routerDeclaration = resolveVariableDeclaration(routerElement);
        return extractRouter(routerDeclaration);
    });
    const commonModels = collectCommonModels(routers, path.dirname(config.inputPath));

    routers.forEach((router) => {
        const routerTypeNames = new Set([
            ...router.routes.flatMap((route) => route.referencedTypeNames),
            ...collectTypeNames([router.modelSourceText]),
        ]);

        router.commonTypeNames = commonModels.typeNames.filter((typeName) => routerTypeNames.has(typeName));
    });

    return {
        routers,
        commonModelSourceText: commonModels.sourceText,
        commonTypeNames: commonModels.typeNames,
    };
}

function extractRouter(routerDeclaration: VariableDeclaration): RouterModel {
    const routerCall = getInitializerCall(routerDeclaration);

    if (getCallName(routerCall) !== 'defineRouter') {
        throw new Error(`${routerDeclaration.getName()} must be initialized with defineRouter(...).`);
    }

    const prefix = getStringArgument(routerCall, 0, `Router ${routerDeclaration.getName()} prefix`);
    const routesArg = unwrapExpression(routerCall.getArguments()[1]);

    if (!Node.isArrayLiteralExpression(routesArg)) {
        throw new Error(`Router ${routerDeclaration.getName()} must receive a routes array literal.`);
    }

    const sourceFile = routerDeclaration.getSourceFile();
    const fileBaseName = stripSuffix(path.basename(sourceFile.getFilePath()), '.router.ts');
    const name = stripSuffix(routerDeclaration.getName(), 'Router') || fileBaseName;
    routerSourceFilesByName.set(name, sourceFile);
    const routes = routesArg.getElements().map((routeElement) => {
        const routeDeclaration = resolveVariableDeclaration(routeElement);
        return extractRoute(routeDeclaration, prefix);
    });

    return {
        name,
        fileBaseName,
        prefix,
        routes,
        modelSourceText: getModelSourceText(sourceFile),
        commonTypeNames: [],
    };
}

function extractRoute(routeDeclaration: VariableDeclaration, routerPrefix: string): RouteModel {
    const routeCall = getInitializerCall(routeDeclaration);
    const callExpression = routeCall.getExpression();

    if (!Node.isPropertyAccessExpression(callExpression)) {
        throw new Error(`${routeDeclaration.getName()} must be initialized with route.method(...).`);
    }

    const method = callExpression.getName() as HttpMethod;

    if (!ROUTE_METHODS.has(method)) {
        throw new Error(`${routeDeclaration.getName()} uses unsupported route method: ${method}`);
    }

    const pathValue = getStringArgument(routeCall, 0, `Route ${routeDeclaration.getName()} path`);
    const handler = routeCall.getArguments()[1];

    if (!Node.isArrowFunction(handler) && !Node.isFunctionExpression(handler)) {
        throw new Error(`${routeDeclaration.getName()} must pass a function handler.`);
    }

    const operationName = routeDeclaration.getName();
    const operationTypeName = toPascalCase(operationName);
    const request = getRequestInfo(handler, operationTypeName);
    const response = getResponseInfo(handler, routeDeclaration.getSourceFile(), operationTypeName);
    const referencedTypeNames = collectTypeNames([
        request.typeText,
        response.typeName,
        response.typeText,
    ]);

    return {
        name: operationName,
        method,
        path: pathValue,
        fullPath: normalizeUrl(routerPrefix, pathValue),
        hasRequest: request.hasRequest,
        requestTypeName: `${operationTypeName}Request`,
        requestTypeText: request.typeText,
        responseTypeName: response.typeName,
        responseTypeText: response.typeText,
        referencedTypeNames,
        hasBody: request.hasBody,
        hasQuery: request.hasQuery,
        hasParams: request.hasParams,
    };
}

function getRequestInfo(
    handler: ArrowFunction | import('ts-morph').FunctionExpression,
    operationTypeName: string,
): {
    hasRequest: boolean;
    typeText?: string;
    hasBody: boolean;
    hasQuery: boolean;
    hasParams: boolean;
} {
    const parameter = handler.getParameters()[0];

    if (!parameter) {
        return {
            hasRequest: false,
            hasBody: false,
            hasQuery: false,
            hasParams: false,
        };
    }

    const parameterType = parameter.getType();
    const properties = new Set(parameterType.getProperties().map((property) => property.getName()));
    const typeNode = parameter.getTypeNode();
    const typeText = typeNode
        ? typeNode.getText()
        : parameterType.getText(parameter, TypeFormatFlags.NoTruncation);

    return {
        hasRequest: properties.size > 0,
        typeText: properties.size > 0 ? typeText : undefined,
        hasBody: properties.has('body'),
        hasQuery: properties.has('query'),
        hasParams: properties.has('params'),
    };
}

function getResponseInfo(
    handler: ArrowFunction | import('ts-morph').FunctionExpression,
    sourceFile: SourceFile,
    operationTypeName: string,
): {
    typeName: string;
    typeText?: string;
} {
    const successExpressions = getReturnExpressions(handler).filter((expression) => !isErrCall(expression));
    const satisfiesTypes = successExpressions
        .map((expression) => Node.isSatisfiesExpression(expression) ? expression.getTypeNode()?.getText() : undefined)
        .filter((typeText): typeText is string => Boolean(typeText));

    if (satisfiesTypes.length > 0) {
        const typeText = unique(satisfiesTypes).join(' | ');
        return createResponseInfo(operationTypeName, typeText);
    }

    const successTypes = successExpressions
        .map((expression) => unwrapSatisfiesExpression(expression).getType())
        .filter((type) => !isRouteErrorType(type));

    if (successTypes.length > 0) {
        const typeText = unique(successTypes.map((type) => type.getText(sourceFile, TypeFormatFlags.NoTruncation))).join(' | ');
        return createResponseInfo(operationTypeName, typeText);
    }

    return {
        typeName: `${operationTypeName}Response`,
        typeText: 'null',
    };
}

function createResponseInfo(operationTypeName: string, typeText: string): {
    typeName: string;
    typeText?: string;
} {
    if (isReusableTypeReference(typeText)) {
        return {
            typeName: typeText,
        };
    }

    return {
        typeName: `${operationTypeName}Response`,
        typeText,
    };
}

function isReusableTypeReference(typeText: string): boolean {
    return /^[A-Z][A-Za-z0-9_]*(\.[A-Z][A-Za-z0-9_]*)?$/u.test(typeText);
}

function getReturnExpressions(
    handler: ArrowFunction | import('ts-morph').FunctionExpression,
): Expression[] {
    const body = handler.getBody();

    if (!Node.isBlock(body)) {
        return [body as Expression];
    }

    return body
        .getDescendantsOfKind(SyntaxKind.ReturnStatement)
        .map((statement: ReturnStatement) => statement.getExpression())
        .filter((expression): expression is Expression => Boolean(expression));
}

function unwrapSatisfiesExpression(expression: Expression): Expression {
    return Node.isSatisfiesExpression(expression)
        ? expression.getExpression()
        : expression;
}

function unwrapExpression(node: Node | undefined): Node | undefined {
    if (!node) {
        return undefined;
    }

    if (Node.isAsExpression(node) || Node.isSatisfiesExpression(node)) {
        return unwrapExpression(node.getExpression());
    }

    return node;
}

function isErrCall(expression: Expression): boolean {
    const unwrapped = unwrapSatisfiesExpression(expression);

    if (!Node.isCallExpression(unwrapped)) {
        return false;
    }

    const callTarget = unwrapped.getExpression();

    if (Node.isPropertyAccessExpression(callTarget)) {
        return callTarget.getExpression().getText() === 'err';
    }

    if (Node.isElementAccessExpression(callTarget)) {
        return callTarget.getExpression().getText() === 'err';
    }

    return false;
}

function isRouteErrorType(type: Type): boolean {
    const okProperty = type.getProperty('ok');

    if (!okProperty) {
        return false;
    }

    const okType = okProperty.getValueDeclaration()?.getType();
    return okType?.getText() === 'false';
}

function getModelSourceText(sourceFile: SourceFile): string {
    const imports = getExternalImportSourceText(sourceFile);

    const declarations = sourceFile
        .getStatements()
        .filter((statement): statement is TypeAliasDeclaration | InterfaceDeclaration | EnumDeclaration => (
            Node.isTypeAliasDeclaration(statement) ||
            Node.isInterfaceDeclaration(statement) ||
            Node.isEnumDeclaration(statement)
        ))
        .map((declaration) => ensureExportedDeclaration(declaration.getText()))
        .join('\n\n');

    return [imports, declarations].filter(Boolean).join('\n\n');
}

function collectCommonModels(routers: RouterModel[], backendSrcDir: string): {
    sourceText: string;
    typeNames: string[];
} {
    const declarations = new Map<string, TypeAliasDeclaration | InterfaceDeclaration | EnumDeclaration>();
    const externalImportSourceFiles = new Set<SourceFile>();
    const routerSourceFiles = new Set(routers.map(getRouterSourceFile));

    const collectDeclaration = (
        declaration: TypeAliasDeclaration | InterfaceDeclaration | EnumDeclaration,
    ) => {
        const name = declaration.getName();

        if (declarations.has(name)) {
            return;
        }

        declarations.set(name, declaration);
        externalImportSourceFiles.add(declaration.getSourceFile());

        collectTypeNames([declaration.getText()]).forEach((typeName) => {
            const dependency = resolveTypeDeclaration(declaration.getSourceFile(), typeName);

            if (!dependency || isExternalImport(declaration.getSourceFile(), typeName)) {
                return;
            }

            if (isBackendLocalDeclaration(dependency, backendSrcDir)) {
                collectDeclaration(dependency);
            }
        });
    };

    routers.forEach((router) => {
        const sourceFile = getRouterSourceFile(router);

        router.routes.forEach((route) => {
            route.referencedTypeNames.forEach((typeName) => {
                const declaration = resolveTypeDeclaration(sourceFile, typeName);

                if (!declaration || routerSourceFiles.has(declaration.getSourceFile())) {
                    return;
                }

                if (isExternalImport(sourceFile, typeName)) {
                    return;
                }

                if (isBackendLocalDeclaration(declaration, backendSrcDir)) {
                    collectDeclaration(declaration);
                }
            });
        });
    });

    const imports = Array.from(externalImportSourceFiles)
        .map(getExternalImportSourceText)
        .filter(Boolean);
    const declarationTexts = Array.from(declarations.values()).map((declaration) => (
        ensureExportedDeclaration(declaration.getText())
    ));

    return {
        sourceText: unique([...imports, ...declarationTexts]).join('\n\n'),
        typeNames: Array.from(declarations.keys()),
    };
}

function getRouterSourceFile(router: RouterModel): SourceFile {
    const sourceFile = routerSourceFilesByName.get(router.name);

    if (!sourceFile) {
        throw new Error(`Could not resolve source file for router ${router.name}.`);
    }

    return sourceFile;
}

function collectTypeNames(typeTexts: Array<string | undefined>): string[] {
    const names = typeTexts.flatMap((typeText) => Array.from(typeText?.matchAll(TYPE_NAME_PATTERN) ?? [])
        .map((match) => match[0])
        .filter((typeName) => !BUILTIN_TYPE_NAMES.has(typeName)));

    return unique(names);
}

function resolveTypeDeclaration(
    sourceFile: SourceFile,
    typeName: string,
): TypeAliasDeclaration | InterfaceDeclaration | EnumDeclaration | undefined {
    const localDeclaration =
        sourceFile.getTypeAlias(typeName) ??
        sourceFile.getInterface(typeName) ??
        sourceFile.getEnum(typeName);

    if (localDeclaration) {
        return localDeclaration;
    }

    for (const importDeclaration of sourceFile.getImportDeclarations()) {
        const namedImport = importDeclaration.getNamedImports().find((importSpecifier) => (
            (importSpecifier.getAliasNode()?.getText() ?? importSpecifier.getName()) === typeName
        ));

        const symbol = namedImport?.getNameNode().getSymbol();
        const declaration = symbol?.getAliasedSymbol()?.getDeclarations()[0];

        if (
            Node.isTypeAliasDeclaration(declaration) ||
            Node.isInterfaceDeclaration(declaration) ||
            Node.isEnumDeclaration(declaration)
        ) {
            return declaration;
        }
    }

    return undefined;
}

function isBackendLocalDeclaration(
    declaration: TypeAliasDeclaration | InterfaceDeclaration | EnumDeclaration,
    backendSrcDir: string,
): boolean {
    const declarationPath = path.resolve(declaration.getSourceFile().getFilePath());
    return declarationPath.startsWith(path.resolve(backendSrcDir)) && !declarationPath.includes('node_modules');
}

function isExternalImport(sourceFile: SourceFile, typeName: string): boolean {
    return sourceFile.getImportDeclarations().some((importDeclaration) => {
        const moduleSpecifier = importDeclaration.getModuleSpecifierValue();

        if (moduleSpecifier.startsWith('.')) {
            return false;
        }

        return importDeclaration.getNamedImports().some((importSpecifier) => (
            (importSpecifier.getAliasNode()?.getText() ?? importSpecifier.getName()) === typeName
        ));
    });
}

function getExternalImportSourceText(sourceFile: SourceFile): string {
    const imports = sourceFile
        .getImportDeclarations()
        .filter((importDeclaration) => !importDeclaration.getModuleSpecifierValue().startsWith('.'));
    const importTexts = imports.map((importDeclaration) => importDeclaration.getText());
    const exportTexts = imports
        .map(getExternalTypeExportText)
        .filter((text): text is string => Boolean(text));

    return unique([...importTexts, ...exportTexts]).join('\n');
}

function getExternalTypeExportText(importDeclaration: ImportDeclaration): string | undefined {
    const namedImports = importDeclaration.getNamedImports();

    if (namedImports.length === 0) {
        return undefined;
    }

    const names = namedImports.map((namedImport) => {
        const name = namedImport.getName();
        const alias = namedImport.getAliasNode()?.getText();
        return alias ? `${name} as ${alias}` : name;
    });

    return `export type { ${names.join(', ')} } from '${importDeclaration.getModuleSpecifierValue()}';`;
}

function ensureExportedDeclaration(text: string): string {
    return text.startsWith('export ') ? text : `export ${text}`;
}

function findCall(sourceFile: SourceFile, callName: string): CallExpression {
    const call = sourceFile
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .find((candidate) => getCallName(candidate) === callName);

    if (!call) {
        throw new Error(`Could not find ${callName}(...) in ${sourceFile.getFilePath()}`);
    }

    return call;
}

function getInitializerCall(declaration: VariableDeclaration): CallExpression {
    const initializer = declaration.getInitializer();

    if (!Node.isCallExpression(initializer)) {
        throw new Error(`${declaration.getName()} must be initialized with a call expression.`);
    }

    return initializer;
}

function getCallName(call: CallExpression): string | undefined {
    const expression = call.getExpression();

    if (Node.isIdentifier(expression)) {
        return expression.getText();
    }

    if (Node.isPropertyAccessExpression(expression)) {
        return expression.getName();
    }

    return undefined;
}

function getStringArgument(call: CallExpression, index: number, label: string): string {
    const argument = call.getArguments()[index];

    if (!Node.isStringLiteral(argument)) {
        throw new Error(`${label} must be a string literal.`);
    }

    return argument.getLiteralText();
}

function resolveVariableDeclaration(node: Node): VariableDeclaration {
    const symbol = node.getSymbol();
    const aliasedSymbol = symbol?.getAliasedSymbol();
    const declaration = (aliasedSymbol ?? symbol)?.getDeclarations()[0];

    if (Node.isVariableDeclaration(declaration)) {
        return declaration;
    }

    throw new Error(`Could not resolve variable declaration for ${node.getText()}.`);
}

function unique(values: string[]): string[] {
    return Array.from(new Set(values));
}
