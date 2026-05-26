export type ClientGeneratorNestConfig = {
    input?: string;
    output?: string;
    customInstance?: string;
    tsConfig?: string;
    strictTypes?: boolean;
    builtinTypeNames?: string[];
};

export type NormalizedConfig = {
    workspaceRoot: string;
    configPath?: string;
    configDir: string;
    inputPath: string;
    outputDir: string;
    customInstancePath: string;
    customInstanceImport: string;
    tsConfigPath: string;
    strictTypes: boolean;
    builtinTypeNames: Set<string>;
};

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'head';

export type ClientArgSource = 'params' | 'query' | 'body';

export type ClientArgModel = {
    source: ClientArgSource;
    name: string;
    typeText: string;
    referencedTypeNames: string[];
};

export type ExternalTypeImportModel = {
    moduleSpecifier: string;
    typeName: string;
};

/**
 * DTO-класс back-nest, разрешённый через `extends createZodDto(<Schema>)`.
 * На фронт эмитится как `interface <name> extends z.infer<typeof <schemaName>> {}`.
 * Имя схемы (`schemaName`) импортируется из `@miracle/types`.
 */
export type LocalDtoModel = {
    name: string;
    schemaName: string;
    schemaModuleSpecifier: string;
};

export type RouteModel = {
    name: string;
    method: HttpMethod;
    path: string;
    fullPath: string;
    hasRequest: boolean;
    clientArgs: ClientArgModel[];
    responseTypeName: string;
    responseTypeText?: string;
    externalTypeImports: ExternalTypeImportModel[];
    referencedTypeNames: string[];
    hasBody: boolean;
    hasQuery: boolean;
    hasParams: boolean;
};

export type ControllerModel = {
    className: string;
    name: string;
    fileBaseName: string;
    prefix: string;
    sourceFilePath: string;
    routes: RouteModel[];
    localDtos: LocalDtoModel[];
    modelSourceText: string;
    commonTypeNames: string[];
    hasModelFile: boolean;
};

export type AppModel = {
    controllers: ControllerModel[];
    commonModelSourceText: string;
    commonTypeNames: string[];
};
