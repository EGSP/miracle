export type BackendValidationGeneratorConfig = {
    input: string;
    output: string;
    tsConfig?: string;
};

export type NormalizedBackendValidationGeneratorConfig = {
    configPath: string;
    configDir: string;
    inputPath: string;
    outputDir: string;
    tsConfigPath: string;
};

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type ValidationSource = 'query' | 'params';

export type ValidationOptions = {
    query?: boolean;
    params?: boolean;
};

export type FieldParserModel = {
    name: string;
    optional: boolean;
    parser: FieldParserKind;
};

export type FieldParserKind =
    | { kind: 'string' }
    | { kind: 'number' }
    | { kind: 'boolean' }
    | { kind: 'literalUnion'; literals: LiteralValue[] };

export type LiteralValue = string | number | boolean;

export type RouteValidationModel = {
    routeName: string;
    method: HttpMethod;
    fullPath: string;
    query?: FieldParserModel[];
    params?: FieldParserModel[];
};

export type BackendValidationModel = {
    routes: RouteValidationModel[];
    warnings: string[];
};
