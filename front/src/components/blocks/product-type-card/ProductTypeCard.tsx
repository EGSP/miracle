import { useMemo } from 'react';
import { Stack, Text } from '@miracle/aramid';
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
import { useUpdateProductType } from '@/lib/queries/product-type.query';
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

    const name = useField('name', productType.name);
    const synonymsText = useField(
        'synonymsText',
        formatSynonymsToText(productType.synonyms),
    );

    const parsedSynonyms = useMemo(
        () => parseSynonymsFromText(synonymsText.value),
        [synonymsText.value],
    );

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

    return (
        <Stack gap={3} className="border border-border p-3">
            <Stack orientation="horizontal" gap={2} className="items-center justify-end">
                <Button
                    size="sm"
                    disabled={!isDirtyAnywhere || !name.value.trim() || updateMutation.isPending}
                    onClick={save}
                >
                    {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
                </Button>
            </Stack>

            <Stack gap={1}>
                <Text.Label as="span">Название</Text.Label>
                <Input
                    id={`product-type-name-${productType.id}`}
                    aria-label="Название типа продукции"
                    value={name.value}
                    onChange={name.onInputChange}
                    disabled={updateMutation.isPending}
                />
            </Stack>

            <Stack gap={1}>
                <Text.Label as="span">Синонимы</Text.Label>
                <Text.Helper as="p">По одному синониму на строку</Text.Helper>
                <Textarea
                    size="md"
                    value={synonymsText.value}
                    onChange={synonymsText.onInputChange}
                    disabled={updateMutation.isPending}
                    placeholder={'муфта\nНЭМС'}
                    aria-label="Синонимы"
                />
                <SynonymsPreview synonyms={parsedSynonyms} />
            </Stack>

            <InlineMutationNotification mutation={updateMutation} successMessage="Сохранено" />
        </Stack>
    );
}
