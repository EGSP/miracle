import { ExtractionStatus, ExtractionType } from '@miracle/types';
import type { FileContent, FileModel, Stored } from '@miracle/types';
import mammoth from 'mammoth';

/** Извлечение текста из документов (docx через mammoth). */
export async function* extractDocumentContent(
    dbFile: Stored<FileModel>,
    pathToFile: string,
): AsyncGenerator<Omit<FileContent, 'id'>, void, void> {
    yield {
        fileId: dbFile.id,
        meta: {
            extractionType: ExtractionType.PARSEDOC,
            extractionStatus: ExtractionStatus.STARTED,
        },
    };

    try {
        const extension = dbFile.extension.toLowerCase();

        if (extension === 'docx') {
            const result = await mammoth.extractRawText({ path: pathToFile });
            yield {
                fileId: dbFile.id,
                meta: {
                    extractionType: ExtractionType.PARSEDOC,
                    extractionStatus: ExtractionStatus.COMPLETED,
                },
                content: [{ text: result.value }],
            };
            return;
        }

        if (extension === 'doc' || extension === 'odt' || extension === 'rtf') {
            throw new Error('Не реализовано: извлечение через LibreOffice');
        }

        throw new Error(`Неподдерживаемое расширение документа: ${extension}`);
    } catch (error) {
        yield {
            fileId: dbFile.id,
            meta: {
                extractionType: ExtractionType.PARSEDOC,
                extractionStatus: ExtractionStatus.FAILED,
                extractionFailedMessage: error instanceof Error ? error.message : String(error),
            },
        };
    }
}
