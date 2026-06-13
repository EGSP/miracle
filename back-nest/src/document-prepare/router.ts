import { FileDomain, getFileDomain, type FileModel } from '@miracle/types';
import type { PreparedEngine } from './extractor.port.js';

/** Id durable-джобы LLM Vision-разметки (запускается линией Yandex как её этап). */
export const VISION_PREPARE_JOB_ID = 'prepare-vision';

/** Выбирает движок подготовки по домену файла. */
export function routePreparedEngine(file: Pick<FileModel, 'extension'>): PreparedEngine | undefined {
    const domain = getFileDomain(file.extension ?? '');
    if (!domain) return undefined;
    if (domain === FileDomain.VISUAL) return 'llm-vision';
    return 'kreuzberg';
}
