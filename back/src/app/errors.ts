export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 500;

export type RouteError<
    TStatus extends ErrorStatus = ErrorStatus,
    TCode extends string = string,
    TDetails = unknown,
> = {
    ok: false;
    status: TStatus;
    code: TCode;
    message: string;
    details?: TDetails;
};

type ErrorFactory<TStatus extends ErrorStatus, TCode extends string> = <TDetails = never>(
    message?: string,
    details?: TDetails,
) => RouteError<TStatus, TCode, TDetails>;

function makeError<TStatus extends ErrorStatus, TCode extends string>(
    status: TStatus,
    code: TCode,
    defaultMessage: string,
): ErrorFactory<TStatus, TCode> {
    return (message = defaultMessage, details) => ({
        ok: false,
        status,
        code,
        message,
        ...(details === undefined ? {} : { details }),
    });
}

export const err = {
    400: makeError(400, 'bad_request', 'Bad request'),
    401: makeError(401, 'unauthorized', 'Unauthorized'),
    403: makeError(403, 'forbidden', 'Forbidden'),
    404: makeError(404, 'not_found', 'Not found'),
    409: makeError(409, 'conflict', 'Conflict'),
    422: makeError(422, 'validation_failed', 'Validation failed'),
    500: makeError(500, 'internal_error', 'Internal error'),

    badRequest: makeError(400, 'bad_request', 'Bad request'),
    unauthorized: makeError(401, 'unauthorized', 'Unauthorized'),
    forbidden: makeError(403, 'forbidden', 'Forbidden'),
    notFound: makeError(404, 'not_found', 'Not found'),
    conflict: makeError(409, 'conflict', 'Conflict'),
    validation: makeError(422, 'validation_failed', 'Validation failed'),
    internal: makeError(500, 'internal_error', 'Internal error'),
} as const;

export function isRouteError(value: unknown): value is RouteError {
    return (
        typeof value === 'object' &&
        value !== null &&
        'ok' in value &&
        value.ok === false &&
        'status' in value &&
        typeof value.status === 'number' &&
        'message' in value &&
        typeof value.message === 'string'
    );
}
