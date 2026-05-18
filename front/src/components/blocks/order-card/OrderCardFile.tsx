import * as React from 'react';
import { IconIndicator, Stack, Text } from '@miracle/aramid';
import type { FileWithMeta } from '@miracle/types';
import { Input } from '@/components/ui/input';
import { FileCard } from '@/components/blocks/FileCard';
import { useField } from '@/contexts/dirty-state/useField';
import { useContribute } from '@/contexts/draft-api/DraftContext';
import { useOrderCardContext } from './OrderCard';

function getFileIndicator(file: FileWithMeta | null): {
    kind: 'succeeded' | 'failed' | 'unknown';
    label: string;
} {
    if (!file) return { kind: 'unknown', label: 'Файл не прикреплен' };
    if (file.meta?.available === true) return { kind: 'succeeded', label: 'Файл доступен' };
    if (file.meta?.available === false) return { kind: 'failed', label: 'Файл недоступен' };
    return { kind: 'unknown', label: 'Статус файла неизвестен' };
}

function FileOption({ file }: { file: FileWithMeta | null }) {
    const indicator = getFileIndicator(file);
    return (
        <Stack orientation="horizontal" gap={2} className="items-center">
            <IconIndicator kind={indicator.kind} label={indicator.label} size={16} />
            {file && <Text as="span" compact>{file.name}</Text>}
        </Stack>
    );
}

export function OrderCardFile() {
    const { order, files, contribute } = useOrderCardContext();

    const fileIdField = useField<string | undefined>('fileId', order.fileId ?? undefined);

    useContribute(contribute, 'fileId', (o) => ({
        ...o,
        fileId: fileIdField.value ?? null,
    }));

    const selectedFile = React.useMemo(
        () => files.find((f) => f.id === fileIdField.value) ?? null,
        [files, fileIdField.value],
    );

    return (
        <Stack gap={2}>
            <Stack gap={1}>
                <Stack orientation="horizontal" gap={2} className="items-center">
                    <Text.Label as="span">Файл</Text.Label>
                    {fileIdField.isDirty && (
                        <Text as="span" compact className="text-muted-foreground">
                            (изменен)
                        </Text>
                    )}
                </Stack>
                <Input.Dropdown<FileWithMeta>
                    items={files}
                    value={selectedFile}
                    onChange={(nextFile) => {
                        if (nextFile?.id === fileIdField.value) return;
                        fileIdField.onChange(nextFile?.id);
                    }}
                    getItemKey={(item) => item.id}
                    renderSelectedItem={(item) => <FileOption file={item} />}
                    renderListItem={(item) => <FileOption file={item} />}
                >
                    <Input.Dropdown.Selected />
                    <Input.Dropdown.List />
                </Input.Dropdown>
            </Stack>

            {selectedFile?.meta?.available === true && (
                <FileCard key={selectedFile.id} file={selectedFile} readonly/>
            )}
        </Stack>
    );
}
