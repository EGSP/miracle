import { FileDomain, getFileDomain, type FileModel } from '@miracle/types';
import type { PreparedEngine } from './extractor.port.js';

export const PREPARE_DOCUMENT_JOB_ID = 'prepare-document';

/** Выбирает движок подготовки по домену файла. */
export function routePreparedEngine(file: Pick<FileModel, 'extension'>): PreparedEngine | undefined {
    const domain = getFileDomain(file.extension ?? '');
    if (!domain) return undefined;
    if (domain === FileDomain.VISUAL) return 'llm-vision';
    return 'kreuzberg';
}

/** Ключ идемпотентности корневой джобы подготовки. */
export function prepareJobKey(fileId: string): readonly [string, string] {
    return [PREPARE_DOCUMENT_JOB_ID, fileId] as const;
}
