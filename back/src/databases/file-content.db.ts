import { ExtractionStatus, FileContent, FileDomain, FileModel, getFileDomain, Stored } from "@miracle/types";
import { registerDb, JsonCollection, CreateEntityInput, StoredEntity } from "./db.js";
import { filesService, getFilePath } from "./file.db.js";
import { extractDocumentContent, extractSpreadsheetContent, extractTextContent, extractVisualContentWithLLM, extractVisualContentWithOCR } from "../lib/extraction/index.js";

/** Запись контента считается активной, если нет мягкого удаления (`deletedAt`). */
function isActiveFileContent(content: StoredEntity<FileContent>): boolean {
    return content.deletedAt == null;
}

export const filesContentDb = registerDb('file-content', await JsonCollection.create<FileContent>('file-content'));

declare module './db.js' {
    interface DbRegistry {
        filesContent: typeof filesContentDb;
    }
}

export const filesContentService = {
    create: async (data: CreateEntityInput<FileContent>) => {
        return filesContentDb.create(data);
    },

    get: async (id: string) => {
        return filesContentDb.getById(id);
    },

    /**
     * Записи контента по `fileId`.
     * По умолчанию только активные (без мягкого удаления); при `includeDeleted: true` — все.
     * Сортировка: от новых к старым по `updatedAt`.
     */
    getContent: async (fileId: string, options?: { includeDeleted?: boolean }): Promise<Stored<FileContent>[]> => {
        const includeDeleted = options?.includeDeleted === true;
        const rows = filesContentDb.ref().filter((content) => {
            if (content.fileId !== fileId) {
                return false;
            }
            if (!includeDeleted && !isActiveFileContent(content)) {
                return false;
            }
            return true;
        });
        return [...rows].sort((a, b) => b.updatedAt - a.updatedAt);
    },

    /**
     * Как {@link JsonCollection.softDelete}: `mark=true` — пометить, `mark=false` — снять пометку.
     * @returns `false`, если записи с таким id нет.
     */
    softDelete: async (contentId: string, mark: boolean): Promise<void> => {
        const fileContent = await filesContentService.get(contentId);
        if (!fileContent)
            throw new Error('Запись контента не найдена');

        await filesContentDb.softDelete(contentId, mark);
    },

    update: async (data: FileContent) => {
        const existingContent = await filesContentService.get(data.id);
        if (!existingContent)
            throw new Error('Содержимое не найдено');

        return filesContentDb.update(data.id, data);
    },

    delete: async (id: string) => {
        return filesContentDb.delete(id);
    },

    extract: async (fileId: string): Promise<void> => {
        const file = await filesService.get(fileId);
        if (!file)
            throw new Error('Файл не найден');

        const domain = getFileDomain(file.extension);
        if (!domain)
            throw new Error(`Тип файла с расширением «${file.extension}» не поддерживается`);

        // Защита от дублирующего запуска: если уже идёт извлечение — выходим без действий.
        // Статус FAILED не блокирует — повторная попытка разрешена.
        const alreadyInProgress = filesContentDb.ref().some(
            (c) =>
                c.fileId === fileId
                && isActiveFileContent(c)
                && c.meta?.extractionStatus === ExtractionStatus.STARTED,
        );
        if (alreadyInProgress)
            return;

        const pathToFile = getFilePath(file);

        // VISUAL — асинхронный воркер, не generator-паттерн.
        // complexLayout → LLM Vision (лучше с чекбоксами/формами), иначе → Yandex OCR.
        if (domain === FileDomain.VISUAL) {
            if (file.settings?.complexLayout) {
                await extractVisualContentWithLLM(file);
            } else {
                await extractVisualContentWithOCR(file);
            }
            return;
        } else {
            let extractor: ((
                dbFile: Stored<FileModel>,
                filePath: string
            ) => AsyncGenerator<Omit<FileContent, 'id'>, void, void>) | undefined;

            switch (domain) {
                case FileDomain.DOCUMENT:
                    extractor = extractDocumentContent;
                    break;
                case FileDomain.SPREADSHEET:
                    extractor = extractSpreadsheetContent;
                    break;
                case FileDomain.TEXT:
                    extractor = extractTextContent;
                    break;
            }

            if (!extractor) {
                return;
            }

            let createdContent: Stored<FileContent> | undefined = undefined;
            // Сразу создаём первое состояние извлечения
            // Чтобы на эту операцию в базе сразу записалось состояние извлечения
            // И повторное извлечение не началось пока не закончится первое
            for await (const content of extractor(file, pathToFile)) {
                if (!createdContent)
                    createdContent = await filesContentService.create(content);
                else
                    createdContent = await filesContentService.update({
                        id: createdContent.id,
                        ...content,
                    });
            }
        }
    },
};
