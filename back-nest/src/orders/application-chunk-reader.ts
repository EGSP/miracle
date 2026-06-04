import { Injectable, NotFoundException } from '@nestjs/common';
import { ExtractionStatus, FileDomain, getFileDomain, type FileModel, type OrderApplication, type Stored } from '@miracle/types';
import Papa from 'papaparse';
import fs from 'fs/promises';
import mammoth from 'mammoth';
import XLSX from 'xlsx';
import { FilesService } from '../files/files.service.js';
import { FilesContentService } from '../files-content/files-content.service.js';

/** Один чанк для извлечения позиций: стабильный ключ + JSON-сериализуемый кусок данных. */
export type ReadChunk = { chunkKey: string; chunk: unknown };

/** Сколько строк таблицы кладём в один чанк (баланс между числом LLM-вызовов и размером промпта). */
const ROWS_PER_CHUNK = 15;

/**
 * Читает приложение заказа в чанки для извлечения позиций.
 *
 * Сначала свитч по типу приложения (текст / файл), затем для файла — {@link readFile} со свитчем
 * по домену (гибрид-роутер):
 * - таблица (xlsx/csv/…) → построчно напрямую, чанк = {@link ROWS_PER_CHUNK} строк;
 * - документ (docx) и простой текст (md/txt) → инлайн целиком, один чанк (без FileContent);
 * - VISUAL (pdf/изображение) → из завершённого FileContent (его обеспечивает дочерний `extract-visual`
 *   в `analyse-application` ДО чтения), чанк = страница.
 *
 * Идентичность чанков (`chunkKey`) детерминирована — запуск извлечения идемпотентен.
 */
@Injectable()
export class ApplicationChunkReader {
    constructor(
        private readonly files: FilesService,
        private readonly filesContent: FilesContentService,
    ) {}

    async read(application: Stored<OrderApplication>): Promise<ReadChunk[]> {
        switch (application.data.type) {
            case 'text': {
                const text = application.data.text.trim();
                return text ? [{ chunkKey: 'text', chunk: { text } }] : [];
            }
            case 'file': {
                const file = await this.files.get(application.data.fileId);
                if (!file) {
                    throw new NotFoundException(`Файл "${application.data.fileId}" не найден`);
                }
                return this.readFile(file);
            }
        }
    }

    /** Доменная логика чтения файла. */
    private async readFile(file: Stored<FileModel>): Promise<ReadChunk[]> {
        switch (getFileDomain(file.extension ?? '')) {
            case FileDomain.SPREADSHEET:
                return this.readSpreadsheet(file);
            case FileDomain.DOCUMENT:
                return this.readDocument(file);
            case FileDomain.TEXT:
                return this.readPlainText(file);
            case FileDomain.VISUAL:
                return this.readFromFileContent(file.id);
            default:
                throw new Error(`Тип файла «${file.extension}» не поддерживается для анализа`);
        }
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

    /** Документ (docx) → текст целиком одним чанком (инлайн, без FileContent). */
    private async readDocument(file: Stored<FileModel>): Promise<ReadChunk[]> {
        const extension = (file.extension ?? '').toLowerCase();
        if (extension !== 'docx') {
            throw new Error(`Извлечение документа «${extension}» не реализовано (поддерживается docx)`);
        }
        const result = await mammoth.extractRawText({ path: this.files.getFilePath(file) });
        const text = result.value.trim();
        return text ? [{ chunkKey: 'document', chunk: { text } }] : [];
    }

    /** Простой текстовый файл (md/txt) → сырое чтение одним чанком (инлайн, без FileContent). */
    private async readPlainText(file: Stored<FileModel>): Promise<ReadChunk[]> {
        const text = (await fs.readFile(this.files.getFilePath(file), 'utf8')).trim();
        return text ? [{ chunkKey: 'text', chunk: { text } }] : [];
    }

    /** VISUAL → текст страниц из завершённого извлечения FileContent, чанк на страницу. */
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
