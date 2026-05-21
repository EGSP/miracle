import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Stack, Text } from '@miracle/aramid';
import type { FileWithMeta } from '@miracle/types';
import { Button } from '@/components/ui/button';
import { FileCard } from '@/components/blocks/FileCard';
import { FilePickerDropdown } from '@/components/blocks/file-picker/FilePickerDropdown';
import { FileUploadDialog } from '@/components/blocks/FileUploadDialog';
import { useGetFiles } from '@/lib/queries/file.query';

// ─── Внутренний компонент когда файл выбран ───────────────────────────────────
// Вынесен отдельно, чтобы хук useGetFiles вызывался только при наличии fileId.

type FileWizardSelectedProps = {
    fileId: string;
    files?: FileWithMeta[];
    onFileSelected: (fileId: string | null) => void;
};

function FileWizardSelected({ fileId, files, onFileSelected }: FileWizardSelectedProps) {
    const { data: fetched, isLoading } = useGetFiles({ id: fileId, includeMeta: true });
    const selectedFile = fetched?.[0] ?? null;

    if (isLoading) {
        return <Text.Label as="p">Загрузка файла…</Text.Label>;
    }

    if (!selectedFile) {
        return (
            <Text.Label as="p" className="text-destructive">
                Файл не найден (id: {fileId})
            </Text.Label>
        );
    }

    return (
        <Stack gap={2}>
            {files && (
                <FilePickerDropdown
                    files={files}
                    value={fileId}
                    onChange={(id) => onFileSelected(id ?? null)}
                />
            )}
            <FileCard file={selectedFile} />
        </Stack>
    );
}

// ─── Публичный компонент ──────────────────────────────────────────────────────

export type FileWizardProps = {
    /** ID текущего выбранного файла. `undefined` — файл не выбран. */
    fileId: string | undefined;
    /**
     * Список файлов для выбора из дропдауна.
     * Если не передан — дропдаун не показывается, только кнопка загрузки.
     */
    files?: FileWithMeta[];
    /** Вызывается при выборе файла из списка или загрузке нового. `null` — файл снят. */
    onFileSelected: (fileId: string | null) => void;
};

export function FileWizard({ fileId, files, onFileSelected }: FileWizardProps) {
    const [dialogOpen, setDialogOpen] = useState(false);

    if (fileId) {
        return (
            <FileWizardSelected
                fileId={fileId}
                files={files}
                onFileSelected={onFileSelected}
            />
        );
    }

    return (
        <Stack gap={2}>
            {files && (
                <FilePickerDropdown
                    files={files}
                    value={null}
                    onChange={(id) => onFileSelected(id ?? null)}
                />
            )}
            <Button
                variant="tertiary"
                size="sm"
                icon={<Upload />}
                label="Загрузить файл"
                className="self-start"
                onClick={() => setDialogOpen(true)}
            />
            <FileUploadDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onUploaded={(id) => onFileSelected(id)}
            />
        </Stack>
    );
}
