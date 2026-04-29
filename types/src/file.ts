export type FileModel = {
    id: string;
    name: string;
    extension: string;

    bytes: number;
    pages: number | undefined;

    authorId: string;
}