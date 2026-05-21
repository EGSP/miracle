import { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { Layer, Stack, Text } from '@miracle/aramid';
import type { ProductType, Stored } from '@miracle/types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { InlineMutationNotification } from '@/components/ui/inline-mutation-notification';
import {
    DirtyGuardProvider,
    useGuardActions,
    useGuardState,
} from '@/contexts/dirty-state/DirtyGuardContext';
import { useField } from '@/contexts/dirty-state/useField';
import {
    formatSynonymsToText,
    parseSynonymsFromText,
} from '@/lib/product-type-synonyms';
import { useSoftDeleteProductType, useUpdateProductType } from '@/lib/queries/product-type.query';
import { SynonymsPreview } from './SynonymsPreview';

type ProductTypeCardProps = {
    productType: Stored<ProductType>;
};

export function ProductTypeCard({ productType }: ProductTypeCardProps) {
    return (
        <DirtyGuardProvider id={productType.id}>
            <ProductTypeCardBody productType={productType} />
        </DirtyGuardProvider>
    );
}

function ProductTypeCardBody({ productType }: ProductTypeCardProps) {
    const { isDirtyAnywhere } = useGuardState();
    const { commitAll } = useGuardActions();
    const updateMutation = useUpdateProductType(productType.id);
    const softDeleteMutation = useSoftDeleteProductType();

    const name = useField('name', productType.name);
    const synonymsText = useField(
        'synonymsText',
        formatSynonymsToText(productType.synonyms),
    );

    const parsedSynonyms = useMemo(
        () => parseSynonymsFromText(synonymsText.value),
        [synonymsText.value],
    );

    const isBusy = updateMutation.isPending || softDeleteMutation.isPending;

    const save = () => {
        const trimmedName = name.value.trim();
        if (!trimmedName) {
            return;
        }

        updateMutation.mutate(
            { name: trimmedName, synonyms: parsedSynonyms },
            { onSuccess: () => commitAll() },
        );
    };

    const handleSoftDelete = () => {
        if (
            !window.confirm(
                'Удалить тип продукции? Запись будет скрыта из списка (мягкое удаление).',
            )
        ) {
            return;
        }
        softDeleteMutation.mutate(productType.id);
    };

    return (
        <Layer>
            <Stack gap={3} className="border border-border p-3">
            <Stack orientation="horizontal" gap={2} className="items-center">
                <Button
                    size="sm"
                    label={updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
                    disabled={!isDirtyAnywhere || !name.value.trim() || isBusy}
                    onClick={save}
                />
                <Button
                    type="button"
                    variant="danger-tertiary"
                    size="sm"
                    icon={<Trash2 />}
                    label="Удалить"
                    disabled={isBusy}
                    onClick={handleSoftDelete}
                />
            </Stack>

            <Stack gap={1}>
                <Text.Label as="span">Название</Text.Label>
                <Input
                    id={`product-type-name-${productType.id}`}
                    aria-label="Название типа продукции"
                    value={name.value}
                    onChange={name.onInputChange}
                    disabled={isBusy}
                />
            </Stack>

            <Stack gap={1}>
                <Text.Label as="span">Синонимы</Text.Label>
                <Text.Helper as="p">По одному синониму на строку</Text.Helper>
                <div className="flex items-start gap-2">
                    <div className="basis-[70%]">
                        <Textarea
                            size="md"
                            value={synonymsText.value}
                            onChange={synonymsText.onInputChange}
                            disabled={isBusy}
                            placeholder={'Вставка электроизолирующая\nМуфтовый...'}
                            aria-label="Синонимы"
                        />
                    </div>
                    <div className="basis-[30%]">
                        <div className="min-w-0 border border-input/50 bg-muted/20 p-2">
                            <SynonymsPreview synonyms={parsedSynonyms} />
                        </div>
                    </div>
                </div>
            </Stack>

            <InlineMutationNotification mutation={updateMutation} successMessage="Сохранено" />
            <InlineMutationNotification mutation={softDeleteMutation} />
            </Stack>
        </Layer>
    );
}
