export type FileContent = {
    id: string;
    fileId: string;
    content?: Content[];

    meta?:{
        extractionType?: ExtractionType;
    }
};

export type Content = {
    page?: number;
    text?: string;
}

export enum ExtractionType{
    RAWREAD = 'rawRead',
    PARSEDOC = 'parseDoc',
    OCR = 'ocr',
}