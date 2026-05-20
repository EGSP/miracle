import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Stack, Text } from '@miracle/aramid';
import type { Stored, ProductType } from '@miracle/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilePickerDropdown } from '@/components/blocks/file-picker/FilePickerDropdown';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { InlineMutationNotification } from '@/components/ui/inline-mutation-notification';
import {
    DirtyGuardProvider,
    useGuardActions,
} from '@/contexts/dirty-state/DirtyGuardContext';
import { useField } from '@/contexts/dirty-state/useField';
import { useGetFiles } from '@/lib/queries/file.query';
import { useProductTypes } from '@/lib/queries/product-type.query';
import { useCreateTechnicalCondition } from '@/lib/queries/technical-condition.query';

function CreateTechnicalConditionForm({ onCreated }: { onCreated: () => void }) {
    const createMutation = useCreateTechnicalCondition();
    const { commitAll, resetAll } = useGuardActions();
    const { data: productTypes = [], isLoading: isProductTypesLoading } = useProductTypes();
    const { data: files = [], isLoading: isFilesLoading } = useGetFiles({ includeMeta: true });

    const fileId = useField<string | undefined>('new-tc-file-id', undefined);
    const productTypeId = useField<string | undefined>('new-tc-product-type-id', undefined);

    const selectedProductType = useMemo(
        () => productTypes.find((pt) => pt.id === productTypeId.value) ?? null,
        [productTypes, productTypeId.value],
    );

    const handleCreate = () => {
        createMutation.mutate(
            {
                fileId: fileId.value,
                productTypeId: productTypeId.value,
                rules: [],
                designationSlots: [],
                displayTemplates: [],
            },
            {
                onSuccess: () => {
                    commitAll();
                    onCreated();
                },
            },
        );
    };

    const handleCancel = () => {
        resetAll();
        onCreated();
    };

    return (
        <>
            <Stack gap={3}>
                <Text.Helper as="p">
                    Все поля необязательны. Файл и тип продукции можно задать сейчас или позже в карточке ТУ.
                </Text.Helper>
                <Stack gap={1}>
                    <Text.Label as="span">Тип продукции</Text.Label>
                    <Input.Dropdown<Stored<ProductType>>
                        items={productTypes}
                        value={selectedProductType}
                        onChange={(next) => productTypeId.onChange(next?.id)}
                        getItemKey={(item) => item.id}
                        disabled={isProductTypesLoading || createMutation.isPending}
                        renderSelectedItem={(item) => (
                            <Text as="span" compact>
                                {item?.name ?? 'Тип не выбран'}
                            </Text>
                        )}
                        renderListItem={(item) => (
                            <Text as="span" compact>
                                {item?.name ?? ''}
                            </Text>
                        )}
                    >
                        <Input.Dropdown.Selected />
                        <Input.Dropdown.List emptyText="Нет типов продукции" />
                    </Input.Dropdown>
                </Stack>
                <Stack gap={1}>
                    <Text.Label as="span">Файл ТУ</Text.Label>
                    {isFilesLoading ? (
                        <Text.Label as="p">Загрузка файлов…</Text.Label>
                    ) : (
                        <FilePickerDropdown
                            files={files}
                            value={fileId.value}
                            onChange={(nextId) => fileId.onChange(nextId)}
                            disabled={createMutation.isPending}
                        />
                    )}
                </Stack>
                <InlineMutationNotification mutation={createMutation} />
            </Stack>
            <DialogFooter>
                <Button
                    variant="outline"
                    onClick={handleCancel}
                    disabled={createMutation.isPending}
                >
                    Отмена
                </Button>
                <Button
                    onClick={handleCreate}
                    disabled={createMutation.isPending}
                >
                    {createMutation.isPending ? 'Создание...' : 'Создать ТУ'}
                </Button>
            </DialogFooter>
        </>
    );
}

export function CreateTechnicalConditionDialog() {
    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
                render={
                    <Button type="button" size="sm">
                        <Plus />
                        Создать ТУ
                    </Button>
                }
            />
            <DialogContent size="medium">
                <DialogHeader>
                    <DialogTitle>Новое техническое условие</DialogTitle>
                </DialogHeader>
                {open && (
                    <DirtyGuardProvider id="create-technical-condition">
                        <CreateTechnicalConditionForm onCreated={() => setOpen(false)} />
                    </DirtyGuardProvider>
                )}
            </DialogContent>
        </Dialog>
    );
}
