import { getAllowedMimeTypes } from '@miracle/types';

export const FILE_UPLOAD_CONFIG = {
    maxSizeBytes: 50 * 1024 * 1024,
    allowedMimeTypes: getAllowedMimeTypes(),
} as const;
