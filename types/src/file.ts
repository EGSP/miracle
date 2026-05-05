export type FileModel = {
    id: string;
    name: string;
    extension: string;

    bytes: number;
    pages: number | undefined;

    authorId: string;
}

export type FileWithMeta = FileModel & {
    meta?: {
        available?: boolean;
    };
}

export type FilesQuery = {
    id?: string;
    authorId?: string;
    available?: boolean;
    includeMeta?: boolean;
};


export enum FileDomain {
    VISUAL = 'visual',
    DOCUMENT = 'document',
    SPREADSHEET = 'spreadsheet',
    TEXT = 'text',
}

/**
 * Определяет домен файла по его расширению
 * @param extension - расширение файла
 * @returns домен файла или undefined, если домен не определен
 */
export function getFileDomain(extension: string): FileDomain | undefined {
    switch (extension) {
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'pdf':
            return FileDomain.VISUAL;
        case 'doc':
        case 'docx':
        case 'odt':
        case 'rtf':
            return FileDomain.DOCUMENT;
        case 'xls':
        case 'xlsx':
        case 'ods':
        case 'csv':
        case 'tsv':
            return FileDomain.SPREADSHEET;
        case 'md':
        case 'txt':
            return FileDomain.TEXT;
    }
    return undefined;
}