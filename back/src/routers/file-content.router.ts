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
            return err.validation('File ID is required');

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
        logger.info(`Извлечение содержимого файла "${fileId}"`);
        logger.info(`Параметры запроса: ${JSON.stringify({ params, query })}`);
        if (!fileId)
            return err.validation('File ID is required');

        const file = await filesService.get(fileId);
        if (!file)
            return err.notFound(`File with id "${fileId}" not found`);

        const others = await filesContentService.getContent(fileId);
        if (others.length > 0) {
            if (query.retryIfLastFailed === true) {
                const last = others.slice(-1)[0];
                if (last?.meta?.extractionStatus === ExtractionStatus.FAILED) {
                    logger.info(`Повторная попытка извлечения содержимого файла "${fileId}", так как предыдущее извлечение завершилось с ошибкой`);
                    await filesContentService.extract(fileId);
                    return;
                }
            }
            return err.badRequest('Content already extracted');
        }

        await filesContentService.extract(fileId);
    },
});

export const filesContentRouter = defineRouter('/files-content', {
    middlewares: [authMiddleware],
    routes: [getContent, extractContent],
} as const);