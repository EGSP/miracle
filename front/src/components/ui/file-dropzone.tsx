import { useRef, useState } from 'react';
import { Upload, X, FileIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type FileDropZoneProps = {
    value: File | null;
    onChange: (file: File | null) => void;
    accept?: string;
    disabled?: boolean;
    className?: string;
};

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileDropZone({ value, onChange, accept, disabled, className }: FileDropZoneProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    const handleClick = () => {
        if (!disabled) {
            inputRef.current?.click();
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        onChange(file);
        e.target.value = '';
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (!disabled) {
            setIsDragOver(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);
        if (disabled) return;

        const file = e.dataTransfer.files?.[0] ?? null;
        onChange(file);
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(null);
    };

    return (
        <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled}
            onClick={handleClick}
            onKeyDown={(e) => e.key === 'Enter' && handleClick()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
                'relative flex min-h-20 w-full cursor-pointer select-none flex-col items-center justify-center gap-2',
                'border border-dashed border-input bg-transparent px-4 py-5 text-xs transition-colors',
                'hover:border-ring hover:bg-muted/40',
                'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50',
                isDragOver && 'border-ring bg-muted/40',
                disabled && 'pointer-events-none cursor-not-allowed opacity-50',
                className,
            )}
        >
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                className="hidden"
                onChange={handleInputChange}
                disabled={disabled}
            />

            {value ? (
                <div className="flex w-full items-center gap-2 text-left">
                    <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">{value.name}</p>
                        <p className="text-muted-foreground">{formatBytes(value.size)}</p>
                    </div>
                    <button
                        type="button"
                        aria-label="Remove file"
                        onClick={handleClear}
                        className={cn(
                            'flex size-5 shrink-0 items-center justify-center rounded-none border border-transparent',
                            'text-muted-foreground transition-colors hover:border-border hover:text-foreground',
                        )}
                    >
                        <X className="size-3" />
                    </button>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-1 text-center">
                    <Upload className="size-5 text-muted-foreground" />
                    <p className="text-muted-foreground">
                        {isDragOver ? 'Drop file here' : 'Click or drag file here'}
                    </p>
                </div>
            )}
        </div>
    );
}

export { FileDropZone };
