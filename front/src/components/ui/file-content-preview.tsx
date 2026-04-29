import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { FileWithMeta } from '@miracle/types';
import { cn } from '@/lib/utils';

type FileKind = 'image' | 'pdf' | 'unknown';

type FileContentPreviewProps = {
    file: FileWithMeta;
    resolveUrl: (file: FileWithMeta) => string;
    children?: ReactNode;
    className?: string;
};

type PreviewContextValue = {
    file: FileWithMeta;
    url: string;
    kind: FileKind;
    isAvailable: boolean;
};

type PreviewSlotProps = {
    className?: string;
};

type FallbackProps = PreviewSlotProps & {
    message?: string;
};

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);

function resolveKind(file: FileWithMeta): FileKind {
    const extension = file.extension.toLowerCase();
    if (IMAGE_EXTENSIONS.has(extension)) return 'image';
    if (extension === 'pdf') return 'pdf';
    return 'unknown';
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

function usePreviewContext() {
    const context = useContext(PreviewContext);
    if (!context) {
        throw new Error('FileContentPreview compound components must be used within FileContentPreview root.');
    }
    return context;
}

function PreviewFallback({ className, message = 'Предпросмотр недоступен' }: FallbackProps) {
    return (
        <div
            className={cn(
                'flex min-h-52 items-center justify-center border border-border bg-muted/20 px-4 text-center text-xs text-muted-foreground',
                className,
            )}
        >
            {message}
        </div>
    );
}

function ImagePreview({ className }: PreviewSlotProps) {
    const { file, url, isAvailable, kind } = usePreviewContext();
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);

    if (!isAvailable || kind !== 'image') {
        return <PreviewFallback className={className} message="Изображение недоступно для предпросмотра" />;
    }

    if (isError) {
        return <PreviewFallback className={className} message="Не удалось загрузить изображение" />;
    }

    return (
        <div className={cn('relative min-h-52 border border-border bg-muted/20 p-2', className)}>
            {isLoading && <div className="absolute inset-2 animate-pulse bg-muted" aria-hidden />}
            <img
                src={url}
                alt={file.name}
                onLoad={() => setIsLoading(false)}
                onError={() => {
                    setIsLoading(false);
                    setIsError(true);
                }}
                className={cn(
                    'mx-auto block h-full max-h-[60vh] w-full object-contain transition-opacity',
                    isLoading ? 'opacity-0' : 'opacity-100',
                )}
            />
        </div>
    );
}

function PdfPreview({ className }: PreviewSlotProps) {
    const { url, isAvailable, kind } = usePreviewContext();
    const [isError, setIsError] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    if (!isAvailable || kind !== 'pdf') {
        return <PreviewFallback className={className} message="PDF недоступен для предпросмотра" />;
    }

    if (isError) {
        return <PreviewFallback className={className} message="Не удалось загрузить PDF" />;
    }

    return (
        <div className={cn('relative min-h-52 border border-border bg-muted/20', className)}>
            {isLoading && <div className="absolute inset-2 animate-pulse bg-muted" aria-hidden />}
            <iframe
                title="PDF preview"
                src={url}
                onLoad={() => setIsLoading(false)}
                onError={() => {
                    setIsLoading(false);
                    setIsError(true);
                }}
                className={cn('h-[60vh] w-full transition-opacity', isLoading ? 'opacity-0' : 'opacity-100')}
            />
        </div>
    );
}

function AutoRenderer() {
    const { kind, isAvailable } = usePreviewContext();

    if (!isAvailable) return <PreviewFallback message="Файл недоступен" />;
    if (kind === 'image') return <ImagePreview />;
    if (kind === 'pdf') return <PdfPreview />;
    return <PreviewFallback />;
}

function FileContentPreviewRoot({ file, resolveUrl, children, className }: FileContentPreviewProps) {
    const contextValue = useMemo<PreviewContextValue>(() => ({
        file,
        url: resolveUrl(file),
        kind: resolveKind(file),
        isAvailable: file.meta?.available !== false,
    }), [file, resolveUrl]);

    return (
        <PreviewContext.Provider value={contextValue}>
            <div className={className}>
                {children ?? <AutoRenderer />}
            </div>
        </PreviewContext.Provider>
    );
}

type FileContentPreviewComponent = typeof FileContentPreviewRoot & {
    Image: typeof ImagePreview;
    PDF: typeof PdfPreview;
    Fallback: typeof PreviewFallback;
};

export const FileContentPreview = Object.assign(FileContentPreviewRoot, {
    Image: ImagePreview,
    PDF: PdfPreview,
    Fallback: PreviewFallback,
}) as FileContentPreviewComponent;

