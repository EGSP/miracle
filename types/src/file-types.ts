import { FileDomain } from './file.js';

/**
 * Поддерживаемые расширения, сгруппированные по файловым доменам.
 * Используется как источник правды для определения домена файла.
 */
export const EXTENSIONS_BY_DOMAIN: Record<FileDomain, readonly string[]> = {
    [FileDomain.VISUAL]: ['jpg', 'jpeg', 'png', 'pdf'],
    [FileDomain.DOCUMENT]: ['doc', 'docx', 'odt', 'rtf'],
    [FileDomain.SPREADSHEET]: ['xls', 'xlsx', 'ods', 'csv', 'tsv'],
    [FileDomain.TEXT]: ['md', 'txt'],
};

/**
 * Каноническое сопоставление расширения и MIME-типа.
 * Ключи хранятся в нижнем регистре.
 */
export const MIME_BY_EXTENSION: Record<string, string> = {
    // Визуальные
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    pdf: 'application/pdf',
    // Документы
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    odt: 'application/vnd.oasis.opendocument.text',
    rtf: 'application/rtf',
    // Таблицы
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    csv: 'text/csv',
    tsv: 'text/tab-separated-values',
    // Текстовые
    md: 'text/markdown',
    txt: 'text/plain',
};

/**
 * Определяет домен файла по расширению.
 * @param extension Расширение файла (с точкой или без — ожидается значение без точки).
 * @returns Домен файла или undefined, если расширение не поддерживается.
 */
export function getFileDomain(extension: string): FileDomain | undefined {
    const normalizedExtension = extension.toLowerCase();

    for (const [domain, extensions] of Object.entries(EXTENSIONS_BY_DOMAIN) as [FileDomain, readonly string[]][]) {
        if (extensions.includes(normalizedExtension)) {
            return domain;
        }
    }

    return undefined;
}

/**
 * Возвращает MIME-тип по расширению файла.
 * @param extension Расширение файла без точки.
 * @returns MIME-тип или undefined, если расширение не поддерживается.
 */
export function getMimeType(extension: string): string | undefined {
    return MIME_BY_EXTENSION[extension.toLowerCase()];
}

/**
 * Возвращает Content-Type для HTTP-ответа.
 * @param extension Расширение файла без точки.
 * @returns MIME-тип или application/octet-stream как fallback.
 */
export function getContentType(extension: string): string {
    return getMimeType(extension) ?? 'application/octet-stream';
}

/**
 * Возвращает список допустимых MIME-типов для загрузки файлов.
 * Повторяющиеся значения удаляются.
 */
export function getAllowedMimeTypes(): string[] {
    return Array.from(new Set(Object.values(MIME_BY_EXTENSION)));
}

/**
 * Возвращает список всех поддерживаемых расширений файлов.
 * Результат нормализован в lower-case и не содержит дубликатов.
 */
export function getAllowedExtensions(): string[] {
    return Array.from(new Set(Object.values(EXTENSIONS_BY_DOMAIN).flat()));
}

/**
 * Проверяет, относится ли расширение к поддерживаемым image-типам.
 * @param extension Расширение файла без точки.
 * @returns true для image/* расширений (например, jpg/png), иначе false.
 */
export function isImageExtension(extension: string): boolean {
    const mimeType = getMimeType(extension);
    return mimeType?.startsWith('image/') ?? false;
}
