import * as React from 'react';
import { IconIndicator, Stack, Text } from '@miracle/aramid';
import type { FileWithMeta } from '@miracle/types';
import { Input } from '@/components/ui/input';
import { useDirtyStore, useField } from '@/contexts/dirty-state/DirtyStateContext';
import type { OrderCardDirtyState } from './OrderCard.types';

function getFileIndicator(file: FileWithMeta | null): { kind: 'succeeded' | 'failed' | 'unknown'; label: string } {
    if (!file) {
        return { kind: 'unknown', label: 'Файл не прикреплен' };
    }

    if (file.meta?.available === true) {
        return { kind: 'succeeded', label: 'Файл доступен' };
    }

    if (file.meta?.available === false) {
        return { kind: 'failed', label: 'Файл недоступен' };
    }

    return { kind: 'unknown', label: 'Статус файла неизвестен' };
}

function FileOption({ file }: { file: FileWithMeta | null }) {
    const indicator = getFileIndicator(file);

    return (
        <Stack orientation="horizontal" gap={2} className="items-center">
            <IconIndicator kind={indicator.kind} label={indicator.label} size={16} />
            {file ? (
                <Text as="span" compact>
                    {file.name}
                </Text>
            ) : null}
        </Stack>
    );
}

export function OrderCardFile({ files }: { files: FileWithMeta[] }) {
    const fileField = useField<OrderCardDirtyState, 'fileId'>('fileId');
    const isDirty = useDirtyStore<OrderCardDirtyState, boolean>((state) => state.isDirty);

    const selectedFile = React.useMemo(
        () => files.find((file) => file.id === fileField.value) ?? null,
        [files, fileField.value]
    );

    return (
        <Stack gap={1}>
            <Stack orientation="horizontal" gap={2} className="items-center">
                <Text.Label as="span">Файл</Text.Label>
                {isDirty ? (
                    <Text as="span" compact className="text-muted-foreground">
                        (изменен)
                    </Text>
                ) : null}
            </Stack>
            <Input.Dropdown<FileWithMeta>
                items={files}
                value={selectedFile}
                onChange={(nextFile) => {
                    const nextFileId = nextFile?.id;
                    if (nextFileId === fileField.value) {
                        return;
                    }
                    fileField.onChange(nextFileId);
                }}
                getItemKey={(item) => item.id}
                renderSelectedItem={(item) => <FileOption file={item} />}
                renderListItem={(item) => <FileOption file={item} />}
            >
                <Input.Dropdown.Selected />
                <Input.Dropdown.List />
            </Input.Dropdown>
        </Stack>
    );
}
