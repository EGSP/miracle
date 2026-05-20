import { useEffect, useMemo, useState } from 'react';
import { Stack, Text } from '@miracle/aramid';
import type { ProductType, Stored } from '@miracle/types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { InlineMutationNotification } from '@/components/ui/inline-mutation-notification';
import {
    formatSynonymsToText,
    parseSynonymsFromText,
} from '@/lib/product-type-synonyms';
import { useUpdateProductType } from '@/lib/queries/product-type.query';

type ProductTypeCardProps = {
    productType: Stored<ProductType>;
};

export function ProductTypeCard({ productType }: ProductTypeCardProps) {
    const updateMutation = useUpdateProductType(productType.id);

    const [name, setName] = useState(productType.name);
    const [synonymsText, setSynonymsText] = useState(() => formatSynonymsToText(productType.synonyms));

    useEffect(() => {
        setName(productType.name);
        setSynonymsText(formatSynonymsToText(productType.synonyms));
    }, [productType.id, productType.name, productType.synonyms]);

    const parsedSynonyms = useMemo(() => parseSynonymsFromText(synonymsText), [synonymsText]);

    const isDirty =
        name.trim() !== productType.name
        || JSON.stringify(parsedSynonyms) !== JSON.stringify(productType.synonyms);

    const save = () => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            return;
        }

        updateMutation.mutate({
            name: trimmedName,
            synonyms: parsedSynonyms,
        });
    };

    return (
        <Stack gap={3} className="border border-border p-3">
            <Stack gap={1}>
                <Text.Label as="span">Название</Text.Label>
                <Input
                    id={`product-type-name-${productType.id}`}
                    aria-label="Название типа продукции"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={updateMutation.isPending}
                />
            </Stack>

            <Stack gap={1}>
                <Text.Label as="span">Синонимы</Text.Label>
                <Text.Helper as="p">По одному синониму на строку</Text.Helper>
                <Textarea
                    size="md"
                    value={synonymsText}
                    onChange={(event) => setSynonymsText(event.target.value)}
                    disabled={updateMutation.isPending}
                    placeholder={'муфта\nНЭМС'}
                    aria-label="Синонимы"
                />
                {parsedSynonyms.length > 0 ? (
                    <Stack as="ul" gap={1} className="list-inside list-disc pl-1">
                        {parsedSynonyms.map((synonym) => (
                            <li key={synonym}>
                                <Text as="span" compact>
                                    {synonym}
                                </Text>
                            </li>
                        ))}
                    </Stack>
                ) : (
                    <Text.Helper as="p">Синонимы не заданы</Text.Helper>
                )}
            </Stack>

            {isDirty && (
                <Stack orientation="horizontal" gap={2} className="items-center">
                    <Button
                        size="sm"
                        disabled={!name.trim() || updateMutation.isPending}
                        onClick={save}
                    >
                        {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
                    </Button>
                </Stack>
            )}

            <InlineMutationNotification mutation={updateMutation} successMessage="Сохранено" />
        </Stack>
    );
}
