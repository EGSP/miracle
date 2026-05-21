import { useMemo, useState } from 'react';
import { Upload } from 'lucide-react';
import { Stack } from '@miracle/aramid';
import { getAllowedExtensions } from '@miracle/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FileDropZone } from '@/components/ui/file-dropzone';
import { InlineMutationNotification } from '@/components/ui/inline-mutation-notification';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useUploadFileWithSettings } from '@/lib/queries/file.query';

export type FileUploadDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Вызывается после успешной загрузки — передаёт id сохранённого файла. */
    onUploaded: (fileId: string) => void;
};

export function FileUploadDialog({ open, onOpenChange, onUploaded }: FileUploadDialogProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [complexLayout, setComplexLayout] = useState(false);
    const [isTechnicalCondition, setIsTechnicalCondition] = useState(false);

    const uploadMutation = useUploadFileWithSettings();

    const allowedExtensionsAccept = useMemo(
        () => getAllowedExtensions().map((ext) => `.${ext}`).join(','),
        [],
    );

    const handleUpload = () => {
        if (!selectedFile) return;

        uploadMutation.mutate(
            {
                fileToUpload: selectedFile,
                settings: {
                    complexLayout: complexLayout || undefined,
                    isTechnicalCondition: isTechnicalCondition || undefined,
                },
            },
            {
                onSuccess: (uploaded) => {
                    onUploaded(uploaded.id);
                    onOpenChange(false);
                    // Сброс состояния после закрытия
                    setSelectedFile(null);
                    setComplexLayout(false);
                    setIsTechnicalCondition(false);
                },
            },
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="small" showCloseButton={!uploadMutation.isPending}>
                <DialogHeader>
                    <DialogTitle>Загрузить файл</DialogTitle>
                </DialogHeader>

                <Stack gap={3}>
                    <FileDropZone
                        value={selectedFile}
                        onChange={setSelectedFile}
                        accept={allowedExtensionsAccept}
                        disabled={uploadMutation.isPending}
                    />

                    <Checkbox.Group
                        label="Настройки"
                        direction="vertical"
                        className="border border-border p-2"
                    >
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

                    <InlineMutationNotification mutation={uploadMutation} />
                </Stack>

                <DialogFooter showCloseButton={!uploadMutation.isPending}>
                    <Button
                        icon={<Upload />}
                        label={uploadMutation.isPending ? 'Загрузка...' : 'Загрузить'}
                        onClick={handleUpload}
                        disabled={!selectedFile || uploadMutation.isPending}
                    />
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
