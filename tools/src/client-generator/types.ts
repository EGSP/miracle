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

export type RouteModel = {
    name: string;
    method: HttpMethod;
    path: string;
    fullPath: string;
    hasRequest: boolean;
    requestTypeName: string;
    requestTypeText?: string;
    responseTypeName: string;
    responseTypeText?: string;
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
};

export type AppModel = {
    routers: RouterModel[];
    commonModelSourceText: string;
    commonTypeNames: string[];
};
