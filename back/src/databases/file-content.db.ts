import { ExtractionType, FileContent, FileDomain, getFileDomain } from "@miracle/types";
import { registerDb, JsonCollection, CreateEntityInput } from "./db.js";
import { filesService, getFilePath } from "./file.db.js";
import fs from 'fs/promises';

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

    getContent: async (fileId: string) => {
        return filesContentDb.ref().filter((content) => content.fileId === fileId);
    },

    update: async (data: FileContent) => {
        const existingContent = await filesContentService.get(data.id);
        if (!existingContent)
            throw new Error('Content not found');

        return filesContentDb.update(data.id, data);
    },

    delete: async (id: string) => {
        return filesContentDb.delete(id);
    },

    extract: async (fileId: string) => {
        const file = await filesService.get(fileId);
        if (!file)
            throw new Error('File not found');

        const domain = getFileDomain(file.extension);
        if (!domain)
            throw new Error('File domain for file with extension "${file.extension}" not supported');

        switch (domain) {
            case FileDomain.VISUAL:
                const content = await extractVisualContent(fileId);
                return content ? true : false;
            case FileDomain.DOCUMENT:
                const content = await extractDocumentContent(fileId);
                return content ? true : false;
            case FileDomain.TEXT: {
                const content = await extractTextContent(fileId);
                return content ? true : false;
            }
                return false;
        }
        return false;
    },
};

/**
 * Читает содержимое текстового файла
 * @param fileId 
 */
async function extractTextContent(fileId: string) {
    const file = await filesService.get(fileId);
    if (!file)
        throw new Error('File not found');

    const text = await fs.readFile(getFilePath(file), 'utf8');

    const content: Omit<FileContent, 'id'> = {
        fileId,
        meta: {
            extractionType: ExtractionType.RAWREAD,
        },
        content: [
            {
                text,
            }
        ]
    }

    const createdContent = await filesContentService.create(content);
    return createdContent;
}