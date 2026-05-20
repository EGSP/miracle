export type FileModel = {
    id: string;
    name: string;
    extension: string;

    bytes: number;
    pages: number | undefined;

    authorId: string;

    /** Хранимые пользовательские настройки файла. */
    settings?: {
        /** Файл содержит сложную структуру (чекбоксы, таблицы-галочки) — использовать LLM Vision вместо OCR. */
        complexLayout?: boolean;
        /** Файл является документом технических условий. */
        isTechnicalCondition?: boolean;
    };
}

export type FileWithMeta = FileModel & {
    /** Вычисляемые поля, добавляемые при запросе (не хранятся в БД). */
    meta?: {
        available?: boolean;
    };
}

export type FilesQuery = {
    id?: string;
    authorId?: string;
    available?: boolean;
    includeMeta?: boolean;
    isTechnicalCondition?: boolean;
};

export const FileDomain = {
    VISUAL: 'visual',
    DOCUMENT: 'document',
    SPREADSHEET: 'spreadsheet',
    TEXT: 'text',
} as const;

export type FileDomain = typeof FileDomain[keyof typeof FileDomain];