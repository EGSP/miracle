import { useMemo } from 'react';
import { IconIndicator, Stack, Text } from '@miracle/aramid';
import type { FileWithMeta } from '@miracle/types';
import { Input } from '@/components/ui/input';

export function getFileIndicator(file: FileWithMeta | null): {
    kind: 'succeeded' | 'failed' | 'unknown';
    label: string;
} {
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
            {file ? <Text as="span" compact>{file.name}</Text> : null}
        </Stack>
    );
}

export type FilePickerDropdownProps = {
    files: FileWithMeta[];
    /** Идентификатор выбранного файла; `undefined` — без файла. */
    value?: string | null;
    onChange: (fileId: string | undefined) => void;
    disabled?: boolean;
};

/**
 * Выбор файла из списка с возможностью сброса (пустой пункт в dropdown).
 */
export function FilePickerDropdown({
    files,
    value,
    onChange,
    disabled = false,
}: FilePickerDropdownProps) {
    const selectedFile = useMemo(
        () => files.find((f) => f.id === value) ?? null,
        [files, value],
    );

    return (
        <Input.Dropdown<FileWithMeta>
            items={files}
            value={selectedFile}
            onChange={(nextFile) => {
                const nextId = nextFile?.id;
                if (nextId === value) {
                    return;
                }
                onChange(nextId);
            }}
            getItemKey={(item) => item.id}
            disabled={disabled}
            renderSelectedItem={(item) => <FileOption file={item} />}
            renderListItem={(item) => <FileOption file={item} />}
        >
            <Input.Dropdown.Selected />
            <Input.Dropdown.List />
        </Input.Dropdown>
    );
}
