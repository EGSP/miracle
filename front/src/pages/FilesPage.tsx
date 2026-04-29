import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { FileIcon, ArrowLeft, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FileDropZone } from '@/components/ui/file-dropzone';
import { useGetFiles, useUploadFile } from '@/lib/queries/file.query';
import type { FileModel } from '@miracle/types';

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileListItem({ file }: { file: FileModel }) {
    return (
        <div className="flex items-center gap-3 border border-border px-3 py-2.5 text-xs">
            <FileIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">{file.name}</span>
            <span className="shrink-0 text-muted-foreground">{file.extension.toUpperCase()}</span>
            <span className="shrink-0 text-muted-foreground">{formatBytes(file.bytes)}</span>
        </div>
    );
}

export default function FilesPage() {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const { data: files, isLoading, error } = useGetFiles();
    const uploadMutation = useUploadFile();

    const handleUpload = () => {
        if (!selectedFile) return;

        uploadMutation.mutate(selectedFile, {
            onSuccess: () => {
                setSelectedFile(null);
            },
        });
    };

    return (
        <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-8">
            <div className="flex items-center gap-3">
                <Link to="/" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="size-3.5" />
                    На главную
                </Link>
                <h1 className="text-base font-medium">Файлы</h1>
            </div>

            <div className="flex gap-6">
                {/* File list */}
                <section className="flex flex-1 flex-col gap-3">
                    <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Загруженные файлы
                    </h2>

                    {isLoading && (
                        <p className="text-xs text-muted-foreground">Загрузка...</p>
                    )}
                    {error && (
                        <p className="text-xs text-destructive">Ошибка: {error.message}</p>
                    )}
                    {files && files.length === 0 && (
                        <p className="text-xs text-muted-foreground">Нет загруженных файлов</p>
                    )}
                    {files && files.length > 0 && (
                        <div className="flex flex-col gap-1">
                            {files.map((f) => (
                                <FileListItem key={f.id} file={f} />
                            ))}
                        </div>
                    )}
                </section>

                {/* Upload panel */}
                <aside className="flex w-72 shrink-0 flex-col gap-3">
                    <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Загрузить файл
                    </h2>

                    <FileDropZone
                        value={selectedFile}
                        onChange={setSelectedFile}
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/jpeg,image/png"
                        disabled={uploadMutation.isPending}
                    />

                    {selectedFile && (
                        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                            <span className="truncate font-medium text-foreground">{selectedFile.name}</span>
                            <span>{formatBytes(selectedFile.size)}</span>
                        </div>
                    )}

                    {uploadMutation.isError && (
                        <p className="text-xs text-destructive">{uploadMutation.error.message}</p>
                    )}

                    <Button
                        onClick={handleUpload}
                        disabled={!selectedFile || uploadMutation.isPending}
                    >
                        <Upload />
                        {uploadMutation.isPending ? 'Загрузка...' : 'Загрузить'}
                    </Button>
                </aside>
            </div>
        </main>
    );
}
