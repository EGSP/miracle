import { SyntaxKind, Node, Project, type CallExpression, type ObjectLiteralExpression, type Type } from 'ts-morph';
import { normalizeUrl } from '../client-generator/naming.js';
import type {
    BackendValidationModel,
    FieldParserKind,
    FieldParserModel,
    HttpMethod,
    LiteralValue,
    NormalizedBackendValidationGeneratorConfig,
    ValidationOptions,
    ValidationSource,
} from './types.js';

const ROUTE_METHODS = new Set<HttpMethod>(['get', 'post', 'put', 'patch', 'delete']);
const VALIDATION_SOURCES = ['query', 'params'] as const satisfies readonly ValidationSource[];

export function extractBackendValidationModel(
    config: NormalizedBackendValidationGeneratorConfig,
): BackendValidationModel {
    const project = new Project({
        tsConfigFilePath: config.tsConfigPath,
    });
    const entryFile = project.getSourceFileOrThrow(config.inputPath);
    const appCall = findCall(entryFile, 'defineApp');
    const routersArg = unwrapExpression(appCall.getArguments()[0]);
    const warnings: string[] = [];

    if (!Node.isArrayLiteralExpression(routersArg)) {
        throw new Error('defineApp must receive an array literal.');
    }

    const routes = routersArg.getElements().flatMap((routerElement) => {
        const routerDeclaration = resolveVariableDeclaration(routerElement);
        const routerCall = getInitializerCall(routerDeclaration);

        if (getCallName(routerCall) !== 'defineRouter') {
            throw new Error(`${routerDeclaration.getName()} must be initialized with defineRouter(...).`);
        }

        const prefix = getStringArgument(routerCall, 0, `Router ${routerDeclaration.getName()} prefix`);
        const routerDefinition = unwrapExpression(routerCall.getArguments()[1]);
        const routerValidate = Node.isObjectLiteralExpression(routerDefinition)
            ? getValidateOptions(routerDefinition)
            : {};
        const routesArray = getRouterRoutesArray(routerCall, routerDeclaration.getName());

        return routesArray.getElements().flatMap((routeElement) => {
            const routeDeclaration = resolveVariableDeclaration(routeElement);
            return extractRouteValidation(routeDeclaration, prefix, routerValidate, warnings);
        });
    });

    warnAboutRouteKeyCollisions(routes, warnings);

    return {
        routes,
        warnings,
    };
}

function warnAboutRouteKeyCollisions(routes: BackendValidationModel['routes'], warnings: string[]): void {
    const seenRoutes = new Map<string, string>();

    routes.forEach((route) => {
        const key = `${route.method.toUpperCase()} ${route.fullPath}`;
        const previousRoute = seenRoutes.get(key);

        if (previousRoute) {
            warnings.push(`Collision: ${key} is used by both ${previousRoute} and ${route.routeName}; last route wins.`);
        }

        seenRoutes.set(key, route.routeName);
    });
}

function extractRouteValidation(
    routeDeclaration: import('ts-morph').VariableDeclaration,
    routerPrefix: string,
    routerValidate: ValidationOptions,
    warnings: string[],
): BackendValidationModel['routes'] {
    const routeCall = getInitializerCall(routeDeclaration);
    const callExpression = routeCall.getExpression();

    if (!Node.isPropertyAccessExpression(callExpression)) {
        throw new Error(`${routeDeclaration.getName()} must be initialized with route.method(...).`);
    }

    const method = callExpression.getName() as HttpMethod;

    if (!ROUTE_METHODS.has(method)) {
        throw new Error(`${routeDeclaration.getName()} uses unsupported route method: ${method}`);
    }

    const path = getStringArgument(routeCall, 0, `Route ${routeDeclaration.getName()} path`);
    const routeDefinition = unwrapExpression(routeCall.getArguments()[1]);
    const routeValidate = Node.isObjectLiteralExpression(routeDefinition)
        ? getValidateOptions(routeDefinition)
        : {};
    const effectiveValidate = mergeValidateOptions(routerValidate, routeValidate);
    const requestedSources = VALIDATION_SOURCES.filter((source) => effectiveValidate[source]);

    if (requestedSources.length === 0) {
        return [];
    }

    const handler = getRouteHandler(routeCall, routeDeclaration.getName());

    if (!Node.isArrowFunction(handler) && !Node.isFunctionExpression(handler)) {
        throw new Error(`${routeDeclaration.getName()} must pass a function handler.`);
    }

    const fieldsBySource = Object.fromEntries(requestedSources.map((source) => {
        const fields = extractFields(handler.getParameters()[0]?.getType(), source, routeDeclaration.getName(), warnings);
        return [source, fields];
    })) as Partial<Record<ValidationSource, FieldParserModel[]>>;
    const hasAnyFields = requestedSources.some((source) => (fieldsBySource[source]?.length ?? 0) > 0);

    if (!hasAnyFields) {
        return [];
    }

    return [{
        routeName: routeDeclaration.getName(),
        method,
        fullPath: normalizeUrl(routerPrefix, path),
        query: fieldsBySource.query,
        params: fieldsBySource.params,
    }];
}

function extractFields(
    contextType: Type | undefined,
    source: ValidationSource,
    routeName: string,
    warnings: string[],
): FieldParserModel[] {
    if (!contextType) {
        warnings.push(`${routeName}: ${source} validation requested, but handler has no context parameter.`);
        return [];
    }

    const property = contextType.getProperty(source);

    if (!property) {
        warnings.push(`${routeName}: ${source} validation requested, but handler context has no ${source} property.`);
        return [];
    }

    const declaration = property.getValueDeclaration() ?? property.getDeclarations()[0];

    if (!declaration) {
        warnings.push(`${routeName}: could not resolve ${source} declaration, skipping.`);
        return [];
    }

    const sourceType = property.getTypeAtLocation(declaration);

    if (sourceType.isUnknown()) {
        warnings.push(`${routeName}: ${source} type is unknown, skipping.`);
        return [];
    }

    const properties = sourceType.getApparentType().getProperties();

    if (properties.length === 0) {
        warnings.push(`${routeName}: ${source} type has no readable fields, skipping.`);
        return [];
    }

    return properties.flatMap((field) => {
        const fieldDeclaration = field.getValueDeclaration() ?? field.getDeclarations()[0];
        const fieldName = field.getName();

        if (!fieldDeclaration) {
            warnings.push(`${routeName}.${source}.${fieldName}: could not resolve field declaration, skipping.`);
            return [];
        }

        const fieldType = field.getTypeAtLocation(fieldDeclaration);
        const parser = getParserKind(fieldType);

        if (!parser) {
            warnings.push(`${routeName}.${source}.${fieldName}: unsupported type "${fieldType.getText()}", skipping.`);
            return [];
        }

        return [{
            name: fieldName,
            optional: isOptionalField(fieldDeclaration, fieldType),
            parser,
        }];
    });
}

function getParserKind(type: Type): FieldParserKind | undefined {
    const normalizedType = removeUndefined(type);

    if (normalizedType.isString()) {
        return { kind: 'string' };
    }

    if (normalizedType.isNumber()) {
        return { kind: 'number' };
    }

    if (normalizedType.isBoolean()) {
        return { kind: 'boolean' };
    }

    if (normalizedType.isStringLiteral() || normalizedType.isNumberLiteral() || isBooleanLiteral(normalizedType)) {
        return {
            kind: 'literalUnion',
            literals: [getLiteralValue(normalizedType)],
        };
    }

    if (!normalizedType.isUnion()) {
        return undefined;
    }

    const literals = normalizedType.getUnionTypes()
        .filter((unionType) => !unionType.isUndefined())
        .map((unionType) => {
            if (unionType.isStringLiteral() || unionType.isNumberLiteral() || isBooleanLiteral(unionType)) {
                return getLiteralValue(unionType);
            }

            return undefined;
        });

    if (literals.some((literal) => literal === undefined)) {
        const apparentType = normalizedType.getApparentType();

        if (apparentType.isString()) {
            return { kind: 'string' };
        }

        return undefined;
    }

    return {
        kind: 'literalUnion',
        literals: literals as LiteralValue[],
    };
}

function isOptionalField(declaration: Node, type: Type): boolean {
    return (
        (Node.isPropertySignature(declaration) && declaration.hasQuestionToken()) ||
        (Node.isPropertyDeclaration(declaration) && declaration.hasQuestionToken()) ||
        type.isUnion() && type.getUnionTypes().some((unionType) => unionType.isUndefined())
    );
}

function removeUndefined(type: Type): Type {
    if (!type.isUnion()) {
        return type;
    }

    const unionTypes = type.getUnionTypes().filter((unionType) => !unionType.isUndefined());
    return unionTypes.length === 1 ? unionTypes[0] : type;
}

function isBooleanLiteral(type: Type): boolean {
    return type.getText() === 'true' || type.getText() === 'false';
}

function getLiteralValue(type: Type): LiteralValue {
    if (type.isStringLiteral()) {
        return String(type.getLiteralValue());
    }

    if (type.isNumberLiteral()) {
        return Number(type.getLiteralValue());
    }

    return type.getText() === 'true';
}

function mergeValidateOptions(routerValidate: ValidationOptions, routeValidate: ValidationOptions): ValidationOptions {
    return {
        query: routeValidate.query ?? routerValidate.query ?? false,
        params: routeValidate.params ?? routerValidate.params ?? false,
    };
}

function getValidateOptions(definition: ObjectLiteralExpression): ValidationOptions {
    const validate = getObjectLiteralInitializer(definition, 'validate');

    if (!Node.isObjectLiteralExpression(validate)) {
        return {};
    }

    return {
        query: getBooleanProperty(validate, 'query'),
        params: getBooleanProperty(validate, 'params'),
    };
}

function getBooleanProperty(objectLiteral: ObjectLiteralExpression, propertyName: string): boolean | undefined {
    const value = getObjectLiteralInitializer(objectLiteral, propertyName);

    if (value?.getKind() === SyntaxKind.TrueKeyword) {
        return true;
    }

    if (value?.getKind() === SyntaxKind.FalseKeyword) {
        return false;
    }

    return undefined;
}

function findCall(sourceFile: import('ts-morph').SourceFile, callName: string): CallExpression {
    const call = sourceFile
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .find((candidate) => getCallName(candidate) === callName);

    if (!call) {
        throw new Error(`Could not find ${callName}(...) in ${sourceFile.getFilePath()}`);
    }

    return call;
}

function getInitializerCall(declaration: import('ts-morph').VariableDeclaration): CallExpression {
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

function getRouterRoutesArray(call: CallExpression, routerName: string): import('ts-morph').ArrayLiteralExpression {
    const definition = unwrapExpression(call.getArguments()[1]);

    if (Node.isArrayLiteralExpression(definition)) {
        return definition;
    }

    if (Node.isObjectLiteralExpression(definition)) {
        const routes = getObjectLiteralInitializer(definition, 'routes');

        if (Node.isArrayLiteralExpression(routes)) {
            return routes;
        }
    }

    throw new Error(`Router ${routerName} must receive a routes array literal.`);
}

function getRouteHandler(call: CallExpression, routeName: string): Node {
    const definition = unwrapExpression(call.getArguments()[1]);

    if (Node.isArrowFunction(definition) || Node.isFunctionExpression(definition)) {
        return definition;
    }

    if (Node.isObjectLiteralExpression(definition)) {
        const handler = getObjectLiteralInitializer(definition, 'handler');

        if (Node.isArrowFunction(handler) || Node.isFunctionExpression(handler)) {
            return handler;
        }
    }

    throw new Error(`${routeName} must pass a function handler.`);
}

function getObjectLiteralInitializer(objectLiteral: ObjectLiteralExpression, propertyName: string): Node | undefined {
    const property = objectLiteral.getProperty(propertyName);

    if (Node.isPropertyAssignment(property)) {
        return unwrapExpression(property.getInitializer());
    }

    return undefined;
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

function resolveVariableDeclaration(node: Node): import('ts-morph').VariableDeclaration {
    const symbol = node.getSymbol();
    const aliasedSymbol = symbol?.getAliasedSymbol();
    const declaration = (aliasedSymbol ?? symbol)?.getDeclarations()[0];

    if (Node.isVariableDeclaration(declaration)) {
        return declaration;
    }

    throw new Error(`Could not resolve variable declaration for ${node.getText()}.`);
}
