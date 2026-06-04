import { Injectable, NotFoundException } from '@nestjs/common';
import { ExtractionStatus, FileDomain, getFileDomain, type FileModel, type OrderApplication, type Stored } from '@miracle/types';
import Papa from 'papaparse';
import fs from 'fs/promises';
import XLSX from 'xlsx';
import { FilesService } from '../files/files.service.js';
import { FilesContentService } from '../files-content/files-content.service.js';

/** Один чанк для извлечения позиций: стабильный ключ + JSON-сериализуемый кусок данных. */
export type ReadChunk = { chunkKey: string; chunk: unknown };

/** Сколько строк таблицы кладём в один чанк (баланс между числом LLM-вызовов и размером промпта). */
const ROWS_PER_CHUNK = 15;

/**
 * Маршрутизатор чтения приложения в чанки (гибрид):
 * - текст → один текстовый чанк;
 * - таблица (xlsx/xls/ods/csv/tsv) → построчное чтение НАПРЯМУЮ (без FileContent), чанк = N строк;
 * - прочие файлы (doc/pdf/скан) → из завершённого извлечения FileContent, чанк = страница.
 *
 * Возвращает чанки; их идентичность (`chunkKey`) детерминирована, чтобы запуск был идемпотентным.
 */
@Injectable()
export class ApplicationChunkReader {
    constructor(
        private readonly files: FilesService,
        private readonly filesContent: FilesContentService,
    ) {}

    async read(application: Stored<OrderApplication>): Promise<ReadChunk[]> {
        const data = application.data;

        if (data.type === 'text') {
            const text = data.text.trim();
            return text ? [{ chunkKey: 'text', chunk: { text } }] : [];
        }

        const file = await this.files.get(data.fileId);
        if (!file) {
            throw new NotFoundException(`Файл "${data.fileId}" не найден`);
        }

        const domain = getFileDomain(file.extension ?? '');
        if (domain === FileDomain.SPREADSHEET) {
            return this.readSpreadsheet(file);
        }
        return this.readFromFileContent(data.fileId);
    }

    /** Таблица → строки-объекты напрямую через XLSX/papaparse, нарезанные по ROWS_PER_CHUNK. */
    private async readSpreadsheet(file: Stored<FileModel>): Promise<ReadChunk[]> {
        const path = this.files.getFilePath(file);
        const extension = (file.extension ?? '').toLowerCase();

        if (extension === 'csv' || extension === 'tsv') {
            const raw = await fs.readFile(path, 'utf8');
            const parsed = Papa.parse<Record<string, unknown>>(raw, {
                header: true,
                skipEmptyLines: true,
                delimiter: extension === 'tsv' ? '\t' : ',',
            });
            if (parsed.errors.length > 0) {
                throw new Error(parsed.errors[0]?.message ?? 'Ошибка разбора CSV/TSV');
            }
            return this.chunkRows('csv', parsed.data);
        }

        const workbook = XLSX.readFile(path);
        return workbook.SheetNames.flatMap((sheetName, index) => {
            const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
                defval: null,
                raw: false,
            });
            return this.chunkRows(`sheet:${index}:${sheetName}`, rows);
        });
    }

    /** Прочие файлы → текст страниц из завершённого извлечения FileContent, чанк на страницу. */
    private async readFromFileContent(fileId: string): Promise<ReadChunk[]> {
        const all = await this.filesContent.getContent(fileId);
        const completed = all.find((c) => c.meta?.extractionStatus === ExtractionStatus.COMPLETED);
        if (!completed) {
            throw new Error(`Файл "${fileId}" не имеет завершённого извлечения (FileContent)`);
        }
        return (completed.content ?? [])
            .map((page, index) => ({
                chunkKey: `page:${page.page ?? index}`,
                chunk: { text: (page.text ?? '').trim() },
            }))
            .filter((c) => (c.chunk as { text: string }).text.length > 0);
    }

    private chunkRows(sheetLabel: string, rows: Record<string, unknown>[]): ReadChunk[] {
        const out: ReadChunk[] = [];
        for (let start = 0; start < rows.length; start += ROWS_PER_CHUNK) {
            const slice = rows.slice(start, start + ROWS_PER_CHUNK);
            const end = start + slice.length - 1;
            out.push({ chunkKey: `${sheetLabel}:rows:${start}-${end}`, chunk: { sheet: sheetLabel, rows: slice } });
        }
        return out;
    }
}
