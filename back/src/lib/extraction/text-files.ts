import { ExtractionStatus, ExtractionType } from "@miracle/types";
import fs from 'fs/promises';
import { FileContent, FileModel, Stored } from "@miracle/types";


/**
 * Читает содержимое текстового файла
 * @param dbFile - файл из базы данных
 * @param pathToFile - путь к файлу
 * @returns - состояния извлечения (промежуточные и финальное)
 */
export async function* extractTextContent(
    dbFile: Stored<FileModel>,
    pathToFile: string): AsyncGenerator<Omit<FileContent, 'id'>, void, void> {
    yield {
        fileId: dbFile.id,
        meta: {
            extractionType: ExtractionType.RAWREAD,
            extractionStatus: ExtractionStatus.STARTED,
        },
    };

    try {
        const text = await fs.readFile(pathToFile, 'utf8');
        const content: Omit<FileContent, 'id'> = {
            fileId: dbFile.id,
            meta: {
                extractionType: ExtractionType.RAWREAD,
                extractionStatus: ExtractionStatus.COMPLETED,
            },
            content: [
                {
                    text,
                }
            ]
        };
        yield content;
    } catch (error) {
        yield {
            fileId: dbFile.id,
            meta: {
                extractionType: ExtractionType.RAWREAD,
                extractionStatus: ExtractionStatus.FAILED,
                extractionFailedMessage: error instanceof Error ? error.message : String(error),
            },
        };
        return;
    }
}