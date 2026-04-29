import { useCallback, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { FileIcon, ArrowLeft, Upload, CircleCheck, CircleX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FileDropZone } from '@/components/ui/file-dropzone';
import { Checkbox } from '@/components/ui/checkbox';
import { TriStateCheckbox, type TriStateValue } from '@/components/ui/derivation/tri-state-checkbox';
import { ListBox } from '@/components/ui/listbox';
import { FileContentPreview } from '@/components/ui/file-content-preview';
import { useGetFiles, useUploadFile } from '@/lib/queries/file.query';
import type { FileWithMeta } from '@miracle/types';
import { useAuthContext } from '@/contexts/AuthContext';
import { frontConfig } from '@/lib/config';

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileListItem({ file }: { file: FileWithMeta }) {
    const isAvailable = file.meta?.available;

    return (
        <div className="flex items-center gap-3 border border-border px-3 py-2.5 text-xs">
            <FileIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">{file.name}</span>
            {isAvailable ? (
                <span className="inline-flex items-center gap-1 text-emerald-500">
                    <CircleCheck className="size-3.5" />
                    Доступен
                </span>
            ) : (
                <span className="inline-flex items-center gap-1 text-destructive">
                    <CircleX className="size-3.5" />
                    Недоступен
                </span>
            )}
            <span className="shrink-0 text-muted-foreground">{file.extension.toUpperCase()}</span>
            <span className="shrink-0 text-muted-foreground">{formatBytes(file.bytes)}</span>
        </div>
    );
}

export default function FilesPage() {
    const [selectedFileInList, setSelectedFileInList] = useState<FileWithMeta | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [myFilesOnly, setMyFilesOnly] = useState(false);
    const [availableOnly, setAvailableOnly] = useState<TriStateValue>(undefined);
    const { userId } = useAuthContext();

    const { data: files, isLoading, error } = useGetFiles({
        authorId: myFilesOnly === true ? userId : undefined,
        available: availableOnly,
        includeMeta: true,
    });
    const uploadMutation = useUploadFile();
    const resolvePreviewUrl = useCallback((file: FileWithMeta) => {
        return `${frontConfig.API_URL}/files/${encodeURIComponent(file.id)}/content`;
    }, []);

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
                    <div className="flex flex-wrap items-center gap-4 border border-border p-2">
                        <label className="inline-flex items-center gap-2 text-xs text-foreground">
                            <Checkbox checked={myFilesOnly} onCheckedChange={(checked) => setMyFilesOnly(checked === true)} />
                            <span>Мои файлы</span>
                        </label>
                        <TriStateCheckbox
                            label="Доступные"
                            value={availableOnly}
                            onChange={setAvailableOnly}
                        />
                    </div>

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
                        <>
                            <ListBox
                                items={files}
                                value={selectedFileInList}
                                onChange={setSelectedFileInList}
                                getKey={(item) => item.id}
                                className="flex flex-col gap-1 outline-none"
                            >
                                <ListBox.Items>
                                    {(item: FileWithMeta, index) => (
                                        <ListBox.Item
                                            item={item}
                                            index={index}
                                            className="cursor-default data-active:bg-muted/60 data-selected:border-primary data-selected:bg-primary/5"
                                        >
                                            <FileListItem file={item} />
                                        </ListBox.Item>
                                    )}
                                </ListBox.Items>
                            </ListBox>
                            {selectedFileInList && (
                                <section className="mt-3 flex flex-col gap-2">
                                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                        Предпросмотр
                                    </h3>
                                    <FileContentPreview file={selectedFileInList} resolveUrl={resolvePreviewUrl} />
                                </section>
                            )}
                        </>
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
