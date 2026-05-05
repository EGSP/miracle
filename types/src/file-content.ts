export type FileContent = {
    id: string;
    fileId: string;
    content?: Content[];

    meta?: {
        extractionType?: ExtractionType;
        extractionStatus?: ExtractionStatus;
        extractionFailedMessage?: string;
    }
};

export type Content = {
    page?: number;
    text?: string;
}

export enum ExtractionType {
    RAWREAD = 'rawRead',
    PARSEDOC = 'parseDoc',
    OCR = 'ocr',
}

export enum ExtractionStatus {
    STARTED = 'started',
    COMPLETED = 'completed',
    FAILED = 'failed',
}