import { FileContent, Stored } from "@miracle/types";
import { err } from "../app/index.js";
import { defineRouter, route } from "../app/router.js";
import { filesContentService } from "../databases/file-content.db.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { filesService } from "../databases/file.db.js";

type GetContentParams = {
    fileId: string;
    onlyLast?: boolean;
}

const getContent = route.get('/:fileId', {
    validate: { params: true },
    handler: async ({ params }: { params: GetContentParams }) => {
        const fileId = params.fileId;
        const onlyLast = params.onlyLast ?? false;
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
}

const extractContent = route.post('/:fileId/extract', {
    validate: { params: true },
    handler: async ({ params }: { params: ExtractContentParams }) => {
        const fileId = params.fileId;
        if (!fileId)
            return err.validation('File ID is required');

        const file = await filesService.get(fileId);
        if (!file)
            return err.notFound(`File with id "${fileId}" not found`);

        const others = await filesContentService.getContent(fileId);
        if (others.length > 0)
            return err.badRequest('Content already extracted');

        await filesContentService.extract(fileId);
    },
});

export const filesContentRouter = defineRouter('/files-content', {
    middlewares: [authMiddleware],
    routes: [getContent, extractContent],
} as const);