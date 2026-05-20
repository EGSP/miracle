import { useMemo } from 'react';
import { Column, Grid, Stack, Text } from '@miracle/aramid';
import type { ProductType, Stored } from '@miracle/types';
import { CreateTechnicalConditionDialog } from '@/components/blocks/tc-card/CreateTechnicalConditionDialog';
import { TechnicalConditionCard } from '@/components/blocks/tc-card/TechnicalConditionCard';
import { DirtyGuardProvider } from '@/contexts/dirty-state/DirtyGuardContext';
import { useProductTypes } from '@/lib/queries/product-type.query';
import { useTechnicalConditions } from '@/lib/queries/technical-condition.query';

export default function TechnicalConditionsPage() {
    const { data: technicalConditions, isLoading, error } = useTechnicalConditions();
    const { data: productTypes } = useProductTypes();

    const productTypeById = useMemo(() => {
        const map = new Map<string, Stored<ProductType>>();
        for (const pt of productTypes ?? []) {
            map.set(pt.id, pt);
        }
        return map;
    }, [productTypes]);

    return (
        <DirtyGuardProvider>
            <Grid as="main" withRowGap>
                <Column span={16}>
                    <Stack gap={3}>
                        <Text.Heading as="h1" variant="02">
                            Технические условия
                        </Text.Heading>
                        <CreateTechnicalConditionDialog />
                    </Stack>
                </Column>

                <Column span={16}>
                    {isLoading && <Text.Label as="p">Загрузка...</Text.Label>}
                    {error && (
                        <Text as="p" compact className="text-destructive">
                            Ошибка: {error.message}
                        </Text>
                    )}
                    {!isLoading && !error && technicalConditions?.length === 0 && (
                        <Text.Label as="p">Технические условия ещё не созданы</Text.Label>
                    )}
                    {technicalConditions && technicalConditions.length > 0 && (
                        <Stack gap={3}>
                            {technicalConditions.map((tc) => {
                                const productType = tc.productTypeId
                                    ? productTypeById.get(tc.productTypeId)
                                    : undefined;
                                const productTypeLabel =
                                    productType?.name
                                    ?? tc.lastProductTypeName
                                    ?? (tc.productTypeId ? tc.productTypeId : null);
                                return (
                                    <Stack key={tc.id} gap={1}>
                                        {productTypeLabel && (
                                            <Text.Label as="span" className="text-muted-foreground">
                                                Тип продукции: {productTypeLabel}
                                                {!tc.productTypeId && tc.lastProductTypeName && ' (id снят)'}
                                            </Text.Label>
                                        )}
                                        <TechnicalConditionCard technicalCondition={tc} />
                                    </Stack>
                                );
                            })}
                        </Stack>
                    )}
                </Column>
            </Grid>
        </DirtyGuardProvider>
    );
}
