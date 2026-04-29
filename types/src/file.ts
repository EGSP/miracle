export type FileModel = {
    id: string;
    name: string;
    extension: string;

    bytes: number;
    pages: number | undefined;

    authorId: string;
}

export type FileWithMeta = FileModel & {
    meta?: {
        available?: boolean;
    };
}

export type FilesQuery = {
    id?: string;
    authorId?: string;
    available?: boolean;
    includeMeta?: boolean;
};