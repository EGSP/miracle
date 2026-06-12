import { ExtractionStatus, ExtractionType } from '@miracle/types';
import type { FileContent, FileModel, Stored } from '@miracle/types';
import Papa from 'papaparse';
import fs from 'fs/promises';
import XLSX from 'xlsx';

function toMarkdownTable(rows: Record<string, unknown>[], fields: string[]): string {
    const escapeCell = (value: unknown) => String(value ?? '').replaceAll('|', '\\|');
    const header = `| ${fields.join(' | ')} |`;
    const divider = `| ${fields.map(() => '---').join(' | ')} |`;
    const lines = rows.map((row) => `| ${fields.map((field) => escapeCell(row[field])).join(' | ')} |`);
    return [header, divider, ...lines].join('\n');
}

/**
 * @deprecated Синхронный экстрактор для `FileContent`. Заменён DPS (kreuzberg).
 * Извлечение содержимого таблиц (xlsx/xls/ods через XLSX; csv/tsv через papaparse).
 */
export async function* extractSpreadsheetContent(
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

        if (extension === 'xlsx' || extension === 'xls' || extension === 'ods') {
            const workbook = XLSX.readFile(pathToFile);
            const content = workbook.SheetNames.map((sheetName, index) => {
                const worksheet = workbook.Sheets[sheetName];
                const csv = XLSX.utils.sheet_to_csv(worksheet);
                return { page: index + 1, text: `${sheetName}\n${csv}` };
            });

            yield {
                fileId: dbFile.id,
                meta: {
                    extractionType: ExtractionType.PARSEDOC,
                    extractionStatus: ExtractionStatus.COMPLETED,
                },
                content,
            };
            return;
        }

        if (extension === 'csv' || extension === 'tsv') {
            const raw = await fs.readFile(pathToFile, 'utf8');
            const parseResult = Papa.parse<Record<string, unknown>>(raw, {
                header: true,
                skipEmptyLines: true,
                delimiter: extension === 'tsv' ? '\t' : ',',
            });

            if (parseResult.errors.length > 0) {
                throw new Error(parseResult.errors[0]?.message ?? 'Ошибка разбора CSV/TSV');
            }

            const fields = parseResult.meta.fields ?? Object.keys(parseResult.data[0] ?? {});
            const table = toMarkdownTable(parseResult.data, fields);

            yield {
                fileId: dbFile.id,
                meta: {
                    extractionType: ExtractionType.PARSEDOC,
                    extractionStatus: ExtractionStatus.COMPLETED,
                },
                content: [{ text: table }],
            };
            return;
        }

        throw new Error(`Неподдерживаемое расширение электронной таблицы: ${extension}`);
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
