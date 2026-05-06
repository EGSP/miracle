import path from 'path';
import fs from 'fs';
import multer from 'multer';
import type { Request, Response } from 'express';
import type { FileModel, FileWithMeta, FilesQuery, User } from '@miracle/types';
import { getAllowedMimeTypes, getContentType } from '@miracle/types';
import { route, defineRouter, err } from '../app/index.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { filesService, getFilePath, getUploadsDir } from '../databases/file.db.js';
import { fixFileNameEncoding } from '../databases/runners/file.run.js';

/**
 * Type hint for the client generator.
 * The generated client will send this type as FormData (multipart/form-data).
 * At runtime the handler does not use body — the file is available via req.file (multer).
 */
type UploadBody = FormData;

type UploadFileResponse = FileModel;

type GetFilesResponse = FileWithMeta[];

export const FILE_UPLOAD_CONFIG = {
    maxSizeBytes: 50 * 1024 * 1024,
    allowedMimeTypes: getAllowedMimeTypes(),
} as const;

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, getUploadsDir());
    },
    filename: (_req, file, cb) => {
        const id = crypto.randomUUID();
        cb(null, `${id}${path.extname(file.originalname)}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: FILE_UPLOAD_CONFIG.maxSizeBytes },
    fileFilter: (_req, file, cb) => {
        const allowed = (FILE_UPLOAD_CONFIG.allowedMimeTypes as readonly string[]).includes(file.mimetype);
        if (allowed) {
            cb(null, true);
        } else {
            cb(new Error(`File type "${file.mimetype}" is not allowed`));
        }
    },
});

const uploadFile = route.post('/upload', {
    middlewares: [upload.single('file')],
    handler: async ({ req, locals }: { req: Request; body: UploadBody; locals: Record<string, unknown> }) => {
        const file = req.file;
        if (!file) {
            return err.validation('No file provided');
        }

        const user = locals.user as User | undefined;
        if (!user?.id) {
            return err.unauthorized('Authenticated user is missing');
        }

        const originalName = fixFileNameEncoding(file.originalname);
        const ext = path.extname(originalName);
        const id = path.basename(file.filename, ext);

        const created = await filesService.create({
            id,
            name: originalName,
            extension: ext.slice(1),
            bytes: file.size,
            pages: undefined,
            authorId: user.id,
        });

        return created satisfies UploadFileResponse;
    },
});

const getFiles = route.get('/', {
    validate: { query: true },
    handler: async ({ query }: { query: FilesQuery }) => {
        const files = filesService.getFiles(query);
        return files satisfies GetFilesResponse;
    },
});

const streamFileContent = route.get('/:id/content', {
    validate: { params: true },
    handler: async ({ params, req, res }: { params: { id: string }; req: Request; res: Response }) => {
        if (!params.id) {
            return err.validation('File id parameter is required');
        }

        const file = await filesService.get(params.id);
        if (!file) {
            return err.notFound(`File with id "${params.id}" not found`);
        }

        const filePath = getFilePath(file);
        if (!fs.existsSync(filePath)) {
            return err.notFound('File content is not available');
        }

        const contentType = getContentType(file.extension);
        const filename = encodeURIComponent(file.name);
        const stat = fs.statSync(filePath);
        const range = req.headers.range;

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${filename}`);
        res.setHeader('Accept-Ranges', 'bytes');

        if (range) {
            const match = range.match(/^bytes=(\d*)-(\d*)$/u);
            if (!match) {
                res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
                return;
            }

            const start = match[1] ? Number(match[1]) : 0;
            const end = match[2] ? Number(match[2]) : stat.size - 1;
            if (start >= stat.size || end >= stat.size || start > end) {
                res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
                return;
            }

            res.status(206);
            res.setHeader('Content-Length', (end - start + 1).toString());
            res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
            await pipeFileToResponse(filePath, res, { start, end });
            return;
        }

        res.setHeader('Content-Length', stat.size.toString());
        await pipeFileToResponse(filePath, res);

        return;
    },
});

function pipeFileToResponse(filePath: string, res: Response, options?: { start: number; end: number }) {
    return new Promise<void>((resolve, reject) => {
        const stream = fs.createReadStream(filePath, options);

        stream.on('error', (error) => {
            if (!res.headersSent) {
                reject(error);
                return;
            }
            res.end();
            resolve();
        });
        res.on('finish', resolve);
        res.on('error', reject);
        stream.pipe(res);
    });
}

export const fileRouter = defineRouter('/files', {
    middlewares: [authMiddleware],
    routes: [getFiles, uploadFile, streamFileContent],
} as const);
