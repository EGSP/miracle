import { ExtractionStatus, ExtractionType, FileContent, FileModel, Stored } from "@miracle/types";
import mammoth from "mammoth";

export async function* extractDocumentContent(
    dbFile: Stored<FileModel>,
    pathToFile: string
): AsyncGenerator<Omit<FileContent, "id">, void, void> {
    yield {
        fileId: dbFile.id,
        meta: {
            extractionType: ExtractionType.PARSEDOC,
            extractionStatus: ExtractionStatus.STARTED,
        },
    };

    try {
        const extension = dbFile.extension.toLowerCase();

        if (extension === "docx") {
            const result = await mammoth.extractRawText({ path: pathToFile });
            yield {
                fileId: dbFile.id,
                meta: {
                    extractionType: ExtractionType.PARSEDOC,
                    extractionStatus: ExtractionStatus.COMPLETED,
                },
                content: [
                    {
                        text: result.value,
                    },
                ],
            };
            return;
        }

        if (extension === "doc" || extension === "odt" || extension === "rtf") {
            throw new Error("Not implemented: LibreOffice extraction");
        }

        throw new Error(`Unsupported document extension: ${extension}`);
    } catch (error) {
        yield {
            fileId: dbFile.id,
            meta: {
                extractionType: ExtractionType.PARSEDOC,
                extractionStatus: ExtractionStatus.FAILED,
                extractionFailedMessage: error instanceof Error ? error.message : String(error),
            },
        };
        return;
    }
}
