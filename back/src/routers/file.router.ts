import path from 'path';
import multer from 'multer';
import type { Request } from 'express';
import type { FileModel, FileWithMeta, FilesQuery, User } from '@miracle/types';
import { route, defineRouter, err } from '../app/index.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { filesService, getUploadsDir } from '../databases/file.db.js';
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
    allowedMimeTypes: [
        'application/pdf',
        'image/jpeg',
        'image/png',
        // Office documents
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
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

export const fileRouter = defineRouter('/files', {
    middlewares: [authMiddleware],
    routes: [getFiles, uploadFile],
} as const);
