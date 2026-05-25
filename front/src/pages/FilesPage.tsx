import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { FileIcon, Upload } from 'lucide-react';
import { Column, Grid, IconIndicator, Stack, Text } from '@miracle/aramid';
import { Button } from '@/components/ui/button';
import { FileDropZone } from '@/components/ui/file-dropzone';
import { Checkbox, type TriStateValue } from '@/components/ui/checkbox';
import { StructuredList, type ListDefinition, type StructuredListKey } from '@/components/ui/structured-list';
import { FileContentPreview } from '@/components/ui/file-content-preview';
import { FileCard } from '@/components/blocks/FileCard';
import { useGetFiles, useUploadFileWithSettings } from '@/lib/queries/file.query';
import { useFilteredFiles } from '@/lib/hooks/useFilteredFiles';
import { getAllowedExtensions, type FileWithMeta } from '@miracle/types';
import { frontConfig } from '@/lib/config';

// ─── Утилиты ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Определение колонок списка ───────────────────────────────────────────────

const fileListDefinition: ListDefinition<FileWithMeta> = {
    getKey: (file) => file.id,
    columns: [
        {
            key: 'icon',
            width: '32px',
            render: () => <FileIcon className="size-4 shrink-0 text-muted-foreground" />,
        },
        {
            key: 'name',
            label: 'Название',
            width: '8fr',
            render: (file) => (
                <span className="truncate">
                    <Text as="span" compact>{file.name}</Text>
                </span>
            ),
        },
        {
            key: 'meta',
            width: '2fr',
            rows: [
                {
                    key: 'available',
                    label: 'Доступность',
                    weight: '1fr',
                    render: (file) => (
                        <IconIndicator
                            kind={file.meta?.available === false ? 'failed' : 'succeeded'}
                            label={file.meta?.available === false ? 'Недоступен' : 'Доступен'}
                            size={16}
                        />
                    ),
                },
                {
                    key: 'extension',
                    label: 'Формат',
                    weight: '1fr',
                    render: (file) => (
                        <Text.Label as="span">{file.extension.toUpperCase()}</Text.Label>
                    ),
                },
                {
                    key: 'size',
                    label: 'Размер',
                    weight: '1fr',
                    render: (file) => (
                        <Text.Label as="span">{formatBytes(file.bytes)}</Text.Label>
                    ),
                },
            ],
        },
    ],
};

// ─── FileListSection ──────────────────────────────────────────────────────────

function FileListSection() {
    const { fileId } = useSearch({ from: '/files' });
    const navigate = useNavigate({ from: '/files' });

    const [myFilesOnly, setMyFilesOnly] = useState(false);
    const [availableOnly, setAvailableOnly] = useState<TriStateValue>(undefined);
    const [tcOnly, setTcOnly] = useState<TriStateValue>(undefined);

    const { data: files, isLoading, error } = useGetFiles({ includeMeta: true });
    const filteredFiles = useFilteredFiles(files, { myFilesOnly, availableOnly, isTechnicalCondition: tcOnly });

    const selected: StructuredListKey[] = useMemo(
        () => fileId ? [fileId] : [],
        [fileId],
    );

    const selectedFile = useMemo(
        () => files?.find((f) => f.id === fileId) ?? null,
        [files, fileId],
    );

    const resolvePreviewUrl = (file: FileWithMeta) =>
        `${frontConfig.API_URL}/files/${encodeURIComponent(file.id)}/content`;

    const handleSelected = (keys: StructuredListKey[]) => {
        void navigate({ search: (prev) => ({ ...prev, fileId: keys[0] as string | undefined }) });
    };

    // Сброс выбора, если файл исчез из отфильтрованного списка
    useEffect(() => {
        if (!fileId) return;
        if (!filteredFiles.some((f) => f.id === fileId)) {
            void navigate({ search: (prev) => ({ ...prev, fileId: undefined }) });
        }
    }, [filteredFiles, fileId, navigate]);

    return (
        <Stack as="section" gap={4}>
            <Text.Heading as="h2" variant="compact-01">
                Загруженные файлы
            </Text.Heading>
            <Checkbox.Group label="Фильтры" direction="horizontal">
                <Checkbox.Item label="Мои файлы" checked={myFilesOnly} onChange={setMyFilesOnly} />
                <Checkbox.TristateItem label="Доступные" value={availableOnly} onChange={setAvailableOnly} />
                <Checkbox.TristateItem label="Технические условия" value={tcOnly} onChange={setTcOnly} />
            </Checkbox.Group>

            {isLoading && <Text.Label as="p">Загрузка...</Text.Label>}
            {error && <Text.Label as="p">Ошибка: {error.message}</Text.Label>}
            {!isLoading && filteredFiles.length === 0 && (
                <Text.Label as="p">Нет загруженных файлов</Text.Label>
            )}
            {filteredFiles.length > 0 && (
                <StructuredList
                    definition={fileListDefinition}
                    items={filteredFiles}
                    selected={selected}
                    onSelected={handleSelected}
                />
            )}
            {selectedFile && (
                <Stack as="section" gap={2}>
                    <Text.Heading as="h3" variant="compact-01">
                        Предпросмотр
                    </Text.Heading>
                    <FileContentPreview file={selectedFile} resolveUrl={resolvePreviewUrl} />
                </Stack>
            )}
        </Stack>
    );
}

// ─── FileUploadSection ────────────────────────────────────────────────────────

function FileUploadSection() {
    const { fileId } = useSearch({ from: '/files' });

    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [complexLayout, setComplexLayout] = useState(false);
    const [isTechnicalCondition, setIsTechnicalCondition] = useState(false);

    const { data: files } = useGetFiles({ includeMeta: true });
    const uploadMutation = useUploadFileWithSettings();

    const allowedExtensionsAccept = useMemo(
        () => getAllowedExtensions().map((ext) => `.${ext}`).join(','),
        [],
    );

    const selectedFile = useMemo(
        () => files?.find((f) => f.id === fileId) ?? null,
        [files, fileId],
    );

    const handleUpload = () => {
        if (!uploadFile) return;
        uploadMutation.mutate(
            {
                fileToUpload: uploadFile,
                settings: {
                    complexLayout: complexLayout || undefined,
                    isTechnicalCondition: isTechnicalCondition || undefined,
                },
            },
            {
                onSuccess: () => {
                    setUploadFile(null);
                    setComplexLayout(false);
                    setIsTechnicalCondition(false);
                },
            },
        );
    };

    return (
        <Stack as="aside" gap={4}>
            <Text.Heading as="h2" variant="compact-01">
                Загрузить файл
            </Text.Heading>

            <FileDropZone
                value={uploadFile}
                onChange={setUploadFile}
                accept={allowedExtensionsAccept}
                disabled={uploadMutation.isPending}
            />

            {uploadFile && (
                <Stack gap={1}>
                    <span className="truncate">
                        <Text as="span" compact>{uploadFile.name}</Text>
                    </span>
                    <Text.Label as="span">{formatBytes(uploadFile.size)}</Text.Label>
                </Stack>
            )}

            <Checkbox.Group label="Настройки" direction="vertical" className="border border-border p-2">
                <Checkbox.Item
                    label="Сложная структура (LLM вместо OCR)"
                    checked={complexLayout}
                    onChange={setComplexLayout}
                    disabled={uploadMutation.isPending}
                />
                <Checkbox.Item
                    label="Технические условия"
                    checked={isTechnicalCondition}
                    onChange={setIsTechnicalCondition}
                    disabled={uploadMutation.isPending}
                />
            </Checkbox.Group>

            {uploadMutation.isError && (
                <Text.Label as="p">{uploadMutation.error.message}</Text.Label>
            )}

            <Button
                icon={<Upload />}
                label={uploadMutation.isPending ? 'Загрузка...' : 'Загрузить'}
                onClick={handleUpload}
                disabled={!uploadFile || uploadMutation.isPending}
            />

            <Stack as="section" gap={2}>
                <Text.Heading as="h3" variant="compact-01">
                    Карточка файла
                </Text.Heading>
                {!selectedFile ? (
                    <Text.Label as="p">Выберите файл в списке слева</Text.Label>
                ) : (
                    <FileCard file={selectedFile} />
                )}
            </Stack>
        </Stack>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/** Двухколоночный контент на 16-колоночной сетке Aramid (модель 2× grid). */
const COL_LIST = 11 as const;
const COL_UPLOAD = 5 as const;

export default function FilesPage() {
    return (
        <Grid as="main" withRowGap fullWidth>
            <Column span="100%">
                <Text.Heading as="h1" variant="02">
                    Файлы
                </Text.Heading>
            </Column>
            <Column span="50%">
                <FileListSection />
            </Column>
            <Column span="50%">
                <FileUploadSection />
            </Column>
        </Grid>
    );
}
