export type ClientGeneratorConfig = {
    input: string;
    output: string;
    customInstance: string;
    tsConfig?: string;
};

export type NormalizedClientGeneratorConfig = {
    configPath: string;
    configDir: string;
    inputPath: string;
    outputDir: string;
    customInstancePath: string;
    customInstanceImport: string;
    tsConfigPath: string;
};

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

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

export type RouterModel = {
    name: string;
    fileBaseName: string;
    prefix: string;
    routes: RouteModel[];
    modelSourceText: string;
    commonTypeNames: string[];
    hasModelFile: boolean;
};

export type AppModel = {
    routers: RouterModel[];
    commonModelSourceText: string;
    commonTypeNames: string[];
};
