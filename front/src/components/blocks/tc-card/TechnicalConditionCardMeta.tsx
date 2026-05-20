import { useMemo } from 'react';
import { Stack, Text } from '@miracle/aramid';
import type { Stored, ProductType, TechnicalCondition } from '@miracle/types';
import { Input } from '@/components/ui/input';
import { FilePickerDropdown } from '@/components/blocks/file-picker/FilePickerDropdown';
import { useContribute } from '@/contexts/draft-api/DraftContext';
import { useField } from '@/contexts/dirty-state/useField';
import { useGetFiles } from '@/lib/queries/file.query';
import { useProductTypes } from '@/lib/queries/product-type.query';
import { useTechnicalConditionCardContext } from './TechnicalConditionCardContext';

export function TechnicalConditionCardMeta() {
    const { technicalCondition, contribute, isSaving } = useTechnicalConditionCardContext();
    const tc = technicalCondition;

    const { data: files = [], isLoading: isFilesLoading } = useGetFiles({ includeMeta: true });
    const { data: productTypes = [], isLoading: isProductTypesLoading } = useProductTypes();

    const fileId = useField<string | undefined>(`tc-${tc.id}-fileId`, tc.fileId);
    const productTypeId = useField<string | undefined>(
        `tc-${tc.id}-productTypeId`,
        tc.productTypeId,
    );

    const selectedProductType = useMemo(
        () => productTypes.find((pt) => pt.id === productTypeId.value) ?? null,
        [productTypes, productTypeId.value],
    );

    useContribute(contribute, `tc-${tc.id}-meta`, (draft): Stored<TechnicalCondition> => ({
        ...draft,
        fileId: fileId.value,
        productTypeId: productTypeId.value,
    }));

    const productTypeLabel = selectedProductType?.name
        ?? tc.lastProductTypeName
        ?? (tc.productTypeId ? tc.productTypeId : null);

    return (
        <Stack gap={2}>
            <Text.Label as="span" className="font-medium">
                Основные поля
            </Text.Label>
            <Stack gap={1}>
                <Text.Label as="span">Файл ТУ</Text.Label>
                {isFilesLoading ? (
                    <Text.Label as="p">Загрузка файлов…</Text.Label>
                ) : (
                    <FilePickerDropdown
                        files={files}
                        value={fileId.value}
                        onChange={(nextId) => fileId.onChange(nextId)}
                        disabled={isSaving}
                    />
                )}
                <Text.Helper as="p">
                    В списке можно выбрать «Файл не прикреплен», чтобы отвязать файл от ТУ.
                </Text.Helper>
            </Stack>
            <Stack gap={1}>
                <Text.Label as="span">Тип продукции</Text.Label>
                <Input.Dropdown<Stored<ProductType>>
                    items={productTypes}
                    value={selectedProductType}
                    onChange={(next) => productTypeId.onChange(next?.id)}
                    getItemKey={(item) => item.id}
                    disabled={isSaving || isProductTypesLoading}
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
                {!productTypeId.value && productTypeLabel && (
                    <Text.Helper as="p">
                        Ранее привязанный тип: {productTypeLabel}
                    </Text.Helper>
                )}
            </Stack>
        </Stack>
    );
}
