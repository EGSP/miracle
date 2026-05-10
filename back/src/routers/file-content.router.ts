import { ExtractionStatus, FileContent, Stored } from "@miracle/types";
import { err } from "../app/index.js";
import { defineRouter, route } from "../app/router.js";
import { filesContentService } from "../databases/file-content.db.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { filesService } from "../databases/file.db.js";
import { logger } from "../logger/logger.js";

type GetContentParams = {
    fileId: string;
};

type GetContentQuery = {
    onlyLast?: boolean;
};

const getContent = route.get('/:fileId', {
    validate: { params: true, query: true },
    handler: async ({ params, query }: { params: GetContentParams; query: GetContentQuery }) => {
        const fileId = params.fileId;
        const onlyLast = query.onlyLast ?? false;
        if (!fileId)
            return err.validation('Не указан идентификатор файла');

        const content = await filesContentService.getContent(fileId);
        if (onlyLast)
            return content.slice(-1) satisfies Stored<FileContent>[];
        return content satisfies Stored<FileContent>[];
    },
});

type ExtractContentParams = {
    fileId: string;
};

type ExtractContentQuery = {
    retryIfLastFailed?: boolean;
};

const extractContent = route.post('/:fileId/extract', {
    validate: { params: true, query: true },
    handler: async ({ params, query }: { params: ExtractContentParams; query: ExtractContentQuery }) => {
        const fileId = params.fileId;

        if (!fileId)
            return err.validation('Не указан идентификатор файла');

        const others = await filesContentService.getContent(fileId);
        if (others.length > 0) {
            /**
             * Можно ли повторить попытку извлечения содержимого файла, 
             * если предыдущая попытка завершилась с ошибкой?
             * Если да, то повторить попытку.
             */
            if (query.retryIfLastFailed === true) {
                const last = others.slice(-1)[0];
                if (last?.meta?.extractionStatus === ExtractionStatus.FAILED) {
                    logger.info(`Повторная попытка извлечения содержимого файла "${fileId}", так как предыдущее извлечение завершилось с ошибкой`);
                    await filesContentService.extract(fileId);
                    return;
                }
            }
            return err.badRequest('Содержимое файла уже извлечено');
        }

        await filesContentService.extract(fileId);
    },
});

export const filesContentRouter = defineRouter('/files-content', {
    middlewares: [authMiddleware],
    routes: [getContent, extractContent],
} as const);