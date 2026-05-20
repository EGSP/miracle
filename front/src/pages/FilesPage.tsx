import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { FileIcon, Upload } from 'lucide-react';
import { Column, Grid, IconIndicator, Stack, Text } from '@miracle/aramid';
import { Button } from '@/components/ui/button';
import { FileDropZone } from '@/components/ui/file-dropzone';
import { Checkbox } from '@/components/ui/checkbox';
import { TriStateCheckbox, type TriStateValue } from '@/components/ui/derivation/tri-state-checkbox';
import { ListBox } from '@/components/ui/listbox';
import { FileContentPreview } from '@/components/ui/file-content-preview';
import { FileCard } from '@/components/blocks/FileCard';
import { useGetFiles, useUploadFile } from '@/lib/queries/file.query';
import { useFilteredFiles } from '@/lib/hooks/useFilteredFiles';
import { getAllowedExtensions, type FileWithMeta } from '@miracle/types';
import { frontConfig } from '@/lib/config';

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileListItem({ file }: { file: FileWithMeta }) {
    const available = file.meta?.available;

    return (
        <Stack
            orientation="horizontal"
            gap={3}
            className="min-w-0 items-center border border-border px-3 py-2.5"
        >
            <FileIcon className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
                <Text as="span" compact>
                    {file.name}
                </Text>
            </span>
            {available === true ? (
                <IconIndicator kind="succeeded" label="Доступен" size={16} className="shrink-0" />
            ) : (
                <IconIndicator kind="failed" label="Недоступен" size={16} className="shrink-0" />
            )}
            <span className="shrink-0">
                <Text.Label as="span">{file.extension.toUpperCase()}</Text.Label>
            </span>
            <span className="shrink-0">
                <Text.Label as="span">{formatBytes(file.bytes)}</Text.Label>
            </span>
        </Stack>
    );
}

/** Двухколоночный контент на 16-колоночной сетке Aramid (модель 2× grid). */
const COL_LIST = 11 as const;
const COL_UPLOAD = 5 as const;

export default function FilesPage() {
    const { fileId: fileIdParam } = useSearch({ from: '/files' });
    const navigate = useNavigate({ from: '/files' });

    const [selectedFileInList, setSelectedFileInList] = useState<FileWithMeta | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [myFilesOnly, setMyFilesOnly] = useState(false);
    const [availableOnly, setAvailableOnly] = useState<TriStateValue>(undefined);
    const { data: files, isLoading, error } = useGetFiles({
        includeMeta: true,
    });
    const filteredFiles = useFilteredFiles(files, { myFilesOnly, availableOnly });
    const uploadMutation = useUploadFile();

    const handleSelectFileInList = useCallback((file: FileWithMeta | null) => {
        setSelectedFileInList(file);
        void navigate({ search: (prev) => ({ ...prev, fileId: file?.id }) });
    }, [navigate]);
    const allowedExtensionsAccept = useMemo(() => getAllowedExtensions().map((extension) => `.${extension}`).join(','), []);
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

    // Синхронизация URL-параметра с выбором при загрузке файлов
    useEffect(() => {
        if (!fileIdParam || !files) return;
        const match = files.find((f) => f.id === fileIdParam);
        if (match) setSelectedFileInList(match);
    }, [fileIdParam, files]);

    // Сброс выбора, если выбранный файл исчез из отфильтрованного списка
    useEffect(() => {
        if (!selectedFileInList) return;
        if (!filteredFiles.some((file) => file.id === selectedFileInList.id)) {
            handleSelectFileInList(null);
        }
    }, [filteredFiles, selectedFileInList, handleSelectFileInList]);

    return (
        <Grid as="main" withRowGap>
            <Column span={16}>
                <Text.Heading as="h1" variant="02">
                    Файлы
                </Text.Heading>
            </Column>

            <Column span={COL_LIST}>
                <Stack as="section" gap={4}>
                    <Text.Heading as="h2" variant="compact-01">
                        Загруженные файлы
                    </Text.Heading>
                    <Stack
                        orientation="horizontal"
                        gap={4}
                        className="flex-wrap items-center border border-border p-2"
                    >
                        <label className="inline-flex items-center gap-2">
                            <Checkbox checked={myFilesOnly} onCheckedChange={(checked) => setMyFilesOnly(checked === true)} />
                            <Text.Label as="span">Мои файлы</Text.Label>
                        </label>
                        <TriStateCheckbox label="Доступные" value={availableOnly} onChange={setAvailableOnly} />
                    </Stack>

                    {isLoading && <Text.Label as="p">Загрузка...</Text.Label>}
                    {error && <Text.Label as="p">Ошибка: {error.message}</Text.Label>}
                    {filteredFiles.length === 0 && (
                        <Text.Label as="p">Нет загруженных файлов</Text.Label>
                    )}
                    {filteredFiles.length > 0 && (
                        <>
                            <ListBox
                                items={filteredFiles}
                                value={selectedFileInList}
                                onChange={handleSelectFileInList}
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
                                <Stack as="section" gap={2}>
                                    <Text.Heading as="h3" variant="compact-01">
                                        Предпросмотр
                                    </Text.Heading>
                                    <FileContentPreview file={selectedFileInList} resolveUrl={resolvePreviewUrl} />
                                </Stack>
                            )}
                        </>
                    )}
                </Stack>
            </Column>

            <Column span={COL_UPLOAD}>
                <Stack as="aside" gap={4}>
                    <Text.Heading as="h2" variant="compact-01">
                        Загрузить файл
                    </Text.Heading>

                    <FileDropZone
                        value={selectedFile}
                        onChange={setSelectedFile}
                        accept={allowedExtensionsAccept}
                        disabled={uploadMutation.isPending}
                    />

                    {selectedFile && (
                        <Stack gap={1}>
                            <span className="truncate">
                                <Text as="span" compact>
                                    {selectedFile.name}
                                </Text>
                            </span>
                            <Text.Label as="span">{formatBytes(selectedFile.size)}</Text.Label>
                        </Stack>
                    )}

                    {uploadMutation.isError && (
                        <Text.Label as="p">{uploadMutation.error.message}</Text.Label>
                    )}

                    <Button onClick={handleUpload} disabled={!selectedFile || uploadMutation.isPending}>
                        <Upload />
                        {uploadMutation.isPending ? 'Загрузка...' : 'Загрузить'}
                    </Button>

                    <Stack as="section" gap={2}>
                        <Text.Heading as="h3" variant="compact-01">
                            Карточка файла
                        </Text.Heading>
                        {!selectedFileInList ? (
                            <Text.Label as="p">Выберите файл в списке слева</Text.Label>
                        ) : (
                            <FileCard file={selectedFileInList} />
                        )}
                    </Stack>
                </Stack>
            </Column>
        </Grid>
    );
}
