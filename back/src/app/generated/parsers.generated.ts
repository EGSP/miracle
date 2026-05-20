/* eslint-disable */
// Файл сгенерирован @miracle/tools backend-validation-generator. Не редактировать вручную.

import { ParseError } from '../errors.js';

function readSingleValue(raw: Record<string, unknown>, field: string) {
    const value = raw[field];

    return {
        value,
        missing: value === undefined,
        multi: Array.isArray(value),
    };
}

function parseNumber(value: unknown): number | undefined {
    if (typeof value === 'number') {
        return Number.isNaN(value) ? undefined : value;
    }

    if (typeof value !== 'string' || value.trim() === '') {
        return undefined;
    }

    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
}

function parseBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') {
        return value;
    }

    if (value === 'true') {
        return true;
    }

    if (value === 'false') {
        return false;
    }

    return undefined;
}

function parseLiteral(value: unknown, literals: Array<string | number | boolean>): string | number | boolean | undefined {
    return literals.find((literal) => {
        if (typeof literal === 'number') {
            return parseNumber(value) === literal;
        }

        if (typeof literal === 'boolean') {
            return parseBoolean(value) === literal;
        }

        return value === literal;
    });
}

export function parseGetUserParams(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_id = readSingleValue(raw, "id");
    if (raw_id.missing) {
        errors.push({ field: "id", message: 'is required' });
    } else if (raw_id.multi) {
        errors.push({ field: "id", message: 'expected single value' });
    } else {
        if (typeof raw_id.value !== 'string') {
            errors.push({ field: "id", message: 'expected string' });
        } else {
            result["id"] = raw_id.value;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseGetTokensParams(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_contentId = readSingleValue(raw, "contentId");
    if (raw_contentId.missing) {
        errors.push({ field: "contentId", message: 'is required' });
    } else if (raw_contentId.multi) {
        errors.push({ field: "contentId", message: 'expected single value' });
    } else {
        if (typeof raw_contentId.value !== 'string') {
            errors.push({ field: "contentId", message: 'expected string' });
        } else {
            result["contentId"] = raw_contentId.value;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseSoftDeleteQuery(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_mark = readSingleValue(raw, "mark");
    if (raw_mark.missing) {
        errors.push({ field: "mark", message: 'is required' });
    } else if (raw_mark.multi) {
        errors.push({ field: "mark", message: 'expected single value' });
    } else {
        const parsed = parseBoolean(raw_mark.value);
        if (parsed === undefined) {
            errors.push({ field: "mark", message: 'expected boolean' });
        } else {
            result["mark"] = parsed;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseSoftDeleteParams(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_contentId = readSingleValue(raw, "contentId");
    if (raw_contentId.missing) {
        errors.push({ field: "contentId", message: 'is required' });
    } else if (raw_contentId.multi) {
        errors.push({ field: "contentId", message: 'expected single value' });
    } else {
        if (typeof raw_contentId.value !== 'string') {
            errors.push({ field: "contentId", message: 'expected string' });
        } else {
            result["contentId"] = raw_contentId.value;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseGetContentQuery(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_onlyLast = readSingleValue(raw, "onlyLast");
    if (raw_onlyLast.missing) {
        result["onlyLast"] = undefined;
    } else if (raw_onlyLast.multi) {
        errors.push({ field: "onlyLast", message: 'expected single value' });
    } else {
        const parsed = parseLiteral(raw_onlyLast.value, [false,true]);
        if (parsed === undefined) {
            errors.push({ field: "onlyLast", message: "expected one of: false, true" });
        } else {
            result["onlyLast"] = parsed;
        }
    }
    const raw_includeDeleted = readSingleValue(raw, "includeDeleted");
    if (raw_includeDeleted.missing) {
        result["includeDeleted"] = undefined;
    } else if (raw_includeDeleted.multi) {
        errors.push({ field: "includeDeleted", message: 'expected single value' });
    } else {
        const parsed = parseLiteral(raw_includeDeleted.value, [false,true]);
        if (parsed === undefined) {
            errors.push({ field: "includeDeleted", message: "expected one of: false, true" });
        } else {
            result["includeDeleted"] = parsed;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseGetContentParams(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_fileId = readSingleValue(raw, "fileId");
    if (raw_fileId.missing) {
        errors.push({ field: "fileId", message: 'is required' });
    } else if (raw_fileId.multi) {
        errors.push({ field: "fileId", message: 'expected single value' });
    } else {
        if (typeof raw_fileId.value !== 'string') {
            errors.push({ field: "fileId", message: 'expected string' });
        } else {
            result["fileId"] = raw_fileId.value;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseExtractContentQuery(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_retryIfLastFailed = readSingleValue(raw, "retryIfLastFailed");
    if (raw_retryIfLastFailed.missing) {
        result["retryIfLastFailed"] = undefined;
    } else if (raw_retryIfLastFailed.multi) {
        errors.push({ field: "retryIfLastFailed", message: 'expected single value' });
    } else {
        const parsed = parseLiteral(raw_retryIfLastFailed.value, [false,true]);
        if (parsed === undefined) {
            errors.push({ field: "retryIfLastFailed", message: "expected one of: false, true" });
        } else {
            result["retryIfLastFailed"] = parsed;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseExtractContentParams(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_fileId = readSingleValue(raw, "fileId");
    if (raw_fileId.missing) {
        errors.push({ field: "fileId", message: 'is required' });
    } else if (raw_fileId.multi) {
        errors.push({ field: "fileId", message: 'expected single value' });
    } else {
        if (typeof raw_fileId.value !== 'string') {
            errors.push({ field: "fileId", message: 'expected string' });
        } else {
            result["fileId"] = raw_fileId.value;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseGetFilesQuery(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_id = readSingleValue(raw, "id");
    if (raw_id.missing) {
        result["id"] = undefined;
    } else if (raw_id.multi) {
        errors.push({ field: "id", message: 'expected single value' });
    } else {
        if (typeof raw_id.value !== 'string') {
            errors.push({ field: "id", message: 'expected string' });
        } else {
            result["id"] = raw_id.value;
        }
    }
    const raw_authorId = readSingleValue(raw, "authorId");
    if (raw_authorId.missing) {
        result["authorId"] = undefined;
    } else if (raw_authorId.multi) {
        errors.push({ field: "authorId", message: 'expected single value' });
    } else {
        if (typeof raw_authorId.value !== 'string') {
            errors.push({ field: "authorId", message: 'expected string' });
        } else {
            result["authorId"] = raw_authorId.value;
        }
    }
    const raw_available = readSingleValue(raw, "available");
    if (raw_available.missing) {
        result["available"] = undefined;
    } else if (raw_available.multi) {
        errors.push({ field: "available", message: 'expected single value' });
    } else {
        const parsed = parseLiteral(raw_available.value, [false,true]);
        if (parsed === undefined) {
            errors.push({ field: "available", message: "expected one of: false, true" });
        } else {
            result["available"] = parsed;
        }
    }
    const raw_includeMeta = readSingleValue(raw, "includeMeta");
    if (raw_includeMeta.missing) {
        result["includeMeta"] = undefined;
    } else if (raw_includeMeta.multi) {
        errors.push({ field: "includeMeta", message: 'expected single value' });
    } else {
        const parsed = parseLiteral(raw_includeMeta.value, [false,true]);
        if (parsed === undefined) {
            errors.push({ field: "includeMeta", message: "expected one of: false, true" });
        } else {
            result["includeMeta"] = parsed;
        }
    }
    const raw_isTechnicalCondition = readSingleValue(raw, "isTechnicalCondition");
    if (raw_isTechnicalCondition.missing) {
        result["isTechnicalCondition"] = undefined;
    } else if (raw_isTechnicalCondition.multi) {
        errors.push({ field: "isTechnicalCondition", message: 'expected single value' });
    } else {
        const parsed = parseLiteral(raw_isTechnicalCondition.value, [false,true]);
        if (parsed === undefined) {
            errors.push({ field: "isTechnicalCondition", message: "expected one of: false, true" });
        } else {
            result["isTechnicalCondition"] = parsed;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parsePatchFileParams(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_id = readSingleValue(raw, "id");
    if (raw_id.missing) {
        errors.push({ field: "id", message: 'is required' });
    } else if (raw_id.multi) {
        errors.push({ field: "id", message: 'expected single value' });
    } else {
        if (typeof raw_id.value !== 'string') {
            errors.push({ field: "id", message: 'expected string' });
        } else {
            result["id"] = raw_id.value;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseRestoreFileParams(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_id = readSingleValue(raw, "id");
    if (raw_id.missing) {
        errors.push({ field: "id", message: 'is required' });
    } else if (raw_id.multi) {
        errors.push({ field: "id", message: 'expected single value' });
    } else {
        if (typeof raw_id.value !== 'string') {
            errors.push({ field: "id", message: 'expected string' });
        } else {
            result["id"] = raw_id.value;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseStreamFileContentParams(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_id = readSingleValue(raw, "id");
    if (raw_id.missing) {
        errors.push({ field: "id", message: 'is required' });
    } else if (raw_id.multi) {
        errors.push({ field: "id", message: 'expected single value' });
    } else {
        if (typeof raw_id.value !== 'string') {
            errors.push({ field: "id", message: 'expected string' });
        } else {
            result["id"] = raw_id.value;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseGetOrderParams(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_id = readSingleValue(raw, "id");
    if (raw_id.missing) {
        errors.push({ field: "id", message: 'is required' });
    } else if (raw_id.multi) {
        errors.push({ field: "id", message: 'expected single value' });
    } else {
        if (typeof raw_id.value !== 'string') {
            errors.push({ field: "id", message: 'expected string' });
        } else {
            result["id"] = raw_id.value;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseGetOrdersQuery(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_id = readSingleValue(raw, "id");
    if (raw_id.missing) {
        result["id"] = undefined;
    } else if (raw_id.multi) {
        errors.push({ field: "id", message: 'expected single value' });
    } else {
        if (typeof raw_id.value !== 'string') {
            errors.push({ field: "id", message: 'expected string' });
        } else {
            result["id"] = raw_id.value;
        }
    }
    const raw_authorId = readSingleValue(raw, "authorId");
    if (raw_authorId.missing) {
        result["authorId"] = undefined;
    } else if (raw_authorId.multi) {
        errors.push({ field: "authorId", message: 'expected single value' });
    } else {
        if (typeof raw_authorId.value !== 'string') {
            errors.push({ field: "authorId", message: 'expected string' });
        } else {
            result["authorId"] = raw_authorId.value;
        }
    }
    const raw_fileId = readSingleValue(raw, "fileId");
    if (raw_fileId.missing) {
        result["fileId"] = undefined;
    } else if (raw_fileId.multi) {
        errors.push({ field: "fileId", message: 'expected single value' });
    } else {
        if (typeof raw_fileId.value !== 'string') {
            errors.push({ field: "fileId", message: 'expected string' });
        } else {
            result["fileId"] = raw_fileId.value;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseCanAnalyseOrderDetailsParams(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_id = readSingleValue(raw, "id");
    if (raw_id.missing) {
        errors.push({ field: "id", message: 'is required' });
    } else if (raw_id.multi) {
        errors.push({ field: "id", message: 'expected single value' });
    } else {
        if (typeof raw_id.value !== 'string') {
            errors.push({ field: "id", message: 'expected string' });
        } else {
            result["id"] = raw_id.value;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseAnalyseOrderDetailsParams(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_id = readSingleValue(raw, "id");
    if (raw_id.missing) {
        errors.push({ field: "id", message: 'is required' });
    } else if (raw_id.multi) {
        errors.push({ field: "id", message: 'expected single value' });
    } else {
        if (typeof raw_id.value !== 'string') {
            errors.push({ field: "id", message: 'expected string' });
        } else {
            result["id"] = raw_id.value;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseClearAnalysedDetailsParams(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_id = readSingleValue(raw, "id");
    if (raw_id.missing) {
        errors.push({ field: "id", message: 'is required' });
    } else if (raw_id.multi) {
        errors.push({ field: "id", message: 'expected single value' });
    } else {
        if (typeof raw_id.value !== 'string') {
            errors.push({ field: "id", message: 'expected string' });
        } else {
            result["id"] = raw_id.value;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseGetWorkersQuery(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_status = readSingleValue(raw, "status");
    if (raw_status.missing) {
        result["status"] = undefined;
    } else if (raw_status.multi) {
        errors.push({ field: "status", message: 'expected single value' });
    } else {
        const parsed = parseLiteral(raw_status.value, ["active","success","stopped","failed"]);
        if (parsed === undefined) {
            errors.push({ field: "status", message: "expected one of: active, success, stopped, failed" });
        } else {
            result["status"] = parsed;
        }
    }
    const raw_sort = readSingleValue(raw, "sort");
    if (raw_sort.missing) {
        result["sort"] = undefined;
    } else if (raw_sort.multi) {
        errors.push({ field: "sort", message: 'expected single value' });
    } else {
        const parsed = parseLiteral(raw_sort.value, ["asc","desc"]);
        if (parsed === undefined) {
            errors.push({ field: "sort", message: "expected one of: asc, desc" });
        } else {
            result["sort"] = parsed;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseApplyWorkerDataParams(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_id = readSingleValue(raw, "id");
    if (raw_id.missing) {
        errors.push({ field: "id", message: 'is required' });
    } else if (raw_id.multi) {
        errors.push({ field: "id", message: 'expected single value' });
    } else {
        if (typeof raw_id.value !== 'string') {
            errors.push({ field: "id", message: 'expected string' });
        } else {
            result["id"] = raw_id.value;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseDeleteWorkerParams(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_id = readSingleValue(raw, "id");
    if (raw_id.missing) {
        errors.push({ field: "id", message: 'is required' });
    } else if (raw_id.multi) {
        errors.push({ field: "id", message: 'expected single value' });
    } else {
        if (typeof raw_id.value !== 'string') {
            errors.push({ field: "id", message: 'expected string' });
        } else {
            result["id"] = raw_id.value;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseGetProductTypeParams(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_id = readSingleValue(raw, "id");
    if (raw_id.missing) {
        errors.push({ field: "id", message: 'is required' });
    } else if (raw_id.multi) {
        errors.push({ field: "id", message: 'expected single value' });
    } else {
        if (typeof raw_id.value !== 'string') {
            errors.push({ field: "id", message: 'expected string' });
        } else {
            result["id"] = raw_id.value;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseUpdateProductTypeParams(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_id = readSingleValue(raw, "id");
    if (raw_id.missing) {
        errors.push({ field: "id", message: 'is required' });
    } else if (raw_id.multi) {
        errors.push({ field: "id", message: 'expected single value' });
    } else {
        if (typeof raw_id.value !== 'string') {
            errors.push({ field: "id", message: 'expected string' });
        } else {
            result["id"] = raw_id.value;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseDeleteProductTypeParams(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_id = readSingleValue(raw, "id");
    if (raw_id.missing) {
        errors.push({ field: "id", message: 'is required' });
    } else if (raw_id.multi) {
        errors.push({ field: "id", message: 'expected single value' });
    } else {
        if (typeof raw_id.value !== 'string') {
            errors.push({ field: "id", message: 'expected string' });
        } else {
            result["id"] = raw_id.value;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseGetTechnicalConditionsQuery(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_productTypeId = readSingleValue(raw, "productTypeId");
    if (raw_productTypeId.missing) {
        result["productTypeId"] = undefined;
    } else if (raw_productTypeId.multi) {
        errors.push({ field: "productTypeId", message: 'expected single value' });
    } else {
        if (typeof raw_productTypeId.value !== 'string') {
            errors.push({ field: "productTypeId", message: 'expected string' });
        } else {
            result["productTypeId"] = raw_productTypeId.value;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseGetTechnicalConditionParams(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_id = readSingleValue(raw, "id");
    if (raw_id.missing) {
        errors.push({ field: "id", message: 'is required' });
    } else if (raw_id.multi) {
        errors.push({ field: "id", message: 'expected single value' });
    } else {
        if (typeof raw_id.value !== 'string') {
            errors.push({ field: "id", message: 'expected string' });
        } else {
            result["id"] = raw_id.value;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}

export function parseReplaceTechnicalConditionParams(raw: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string }> = [];
    const result: Record<string, unknown> = {};

    const raw_id = readSingleValue(raw, "id");
    if (raw_id.missing) {
        errors.push({ field: "id", message: 'is required' });
    } else if (raw_id.multi) {
        errors.push({ field: "id", message: 'expected single value' });
    } else {
        if (typeof raw_id.value !== 'string') {
            errors.push({ field: "id", message: 'expected string' });
        } else {
            result["id"] = raw_id.value;
        }
    }

    if (errors.length > 0) {
        throw new ParseError(errors);
    }

    return result;
}
