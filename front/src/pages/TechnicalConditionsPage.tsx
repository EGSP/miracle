import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Column, Grid, Stack, Text } from '@miracle/aramid';
import type { Stored, TechnicalCondition } from '@miracle/types';
import { CreateTechnicalConditionDialog } from '@/components/blocks/tc-card/CreateTechnicalConditionDialog';
import { TechnicalConditionCard } from '@/components/blocks/tc-card/TechnicalConditionCard';
import { ListBox } from '@/components/ui/listbox';
import { DirtyGuardProvider, useGuardState } from '@/contexts/dirty-state/DirtyGuardContext';
import { useTechnicalConditions } from '@/lib/queries/technical-condition.query';

const COL_CARD = "75%" as const;
const COL_LIST = "25%" as const;

function TcListItem({ tc }: { tc: Stored<TechnicalCondition> }) {
    const tcName = tc.name ?? "Без названия";
    const tcProductTypeName = tc.lastProductTypeName ?? "Без типа продукции";

    return (
        <Stack gap={1} className="min-w-0 px-2 py-1.5">
            <Text.Label as="span" className="truncate" expressive>
                {tcName}
            </Text.Label>
            {tcProductTypeName && (
                <Text.Helper as="span" className="truncate text-muted-foreground">
                    {tcProductTypeName}
                </Text.Helper>
            )}
        </Stack>
    );
}

function TechnicalConditionsPageContent() {
    const { tcId: tcIdParam } = useSearch({ from: '/technical-conditions' });
    const navigate = useNavigate({ from: '/technical-conditions' });
    const { isDirtyAnywhere } = useGuardState();

    const { data: technicalConditions, isLoading, error } = useTechnicalConditions();

    const [selectedTc, setSelectedTc] = useState<Stored<TechnicalCondition> | null>(null);

    const handleSelect = useCallback(
        (next: Stored<TechnicalCondition> | null) => {
            if (isDirtyAnywhere) return;
            setSelectedTc(next);
            void navigate({ search: (prev) => ({ ...prev, tcId: next?.id }) });
        },
        [isDirtyAnywhere, navigate],
    );

    // Синхронизация URL-параметра с состоянием при загрузке списка
    useEffect(() => {
        if (!tcIdParam || !technicalConditions) return;
        const match = technicalConditions.find((tc) => tc.id === tcIdParam);
        if (!match) return;
        setSelectedTc((prev) => {
            if (prev?.id === match.id && prev.updatedAt === match.updatedAt) return prev;
            return match;
        });
    }, [tcIdParam, technicalConditions]);

    const getTcKey = useCallback((tc: Stored<TechnicalCondition>) => tc.id, []);

    return (
        <Grid as="main" fullWidth withRowGap>
            {/* Шапка */}
            <Column span="100%">
                <Stack orientation="vertical" gap={3}>
                    <Text.Heading as="h1" variant="02">
                        Технические условия
                    </Text.Heading>
                    <CreateTechnicalConditionDialog />
                </Stack>
            </Column>

            {/* Список ТУ */}
            <Column span={COL_LIST}>
                <Stack as="section" gap={3}>
                    <Text.Heading as="h2" variant="compact-01">
                        Список ТУ
                    </Text.Heading>

                    {isLoading && (
                        <Text.Label as="p">Загрузка…</Text.Label>
                    )}
                    {error && (
                        <Text as="p" compact className="text-destructive">
                            Ошибка: {error.message}
                        </Text>
                    )}
                    {!isLoading && !error && technicalConditions?.length === 0 && (
                        <Text.Label as="p" className="text-muted-foreground">
                            Нет технических условий
                        </Text.Label>
                    )}
                    {technicalConditions && technicalConditions.length > 0 && (
                        <ListBox
                            items={technicalConditions}
                            value={selectedTc}
                            onChange={handleSelect}
                            getKey={getTcKey}
                            className="flex flex-col gap-1 outline-none"
                        >
                            <ListBox.Items>
                                {(item: Stored<TechnicalCondition>, index) => (
                                    <ListBox.Item
                                        item={item}
                                        index={index}
                                        className="cursor-default data-active:bg-muted/60 data-selected:border-primary data-selected:bg-primary/5"
                                    >
                                        <TcListItem tc={item} />
                                    </ListBox.Item>
                                )}
                            </ListBox.Items>
                        </ListBox>
                    )}
                </Stack>
            </Column>

            {/* Карточка выбранного ТУ */}
            <Column span={COL_CARD}>
                {selectedTc ? (
                    <TechnicalConditionCard
                        key={selectedTc.id}
                        technicalCondition={selectedTc}
                        onTechnicalConditionSaved={(saved) => setSelectedTc(saved)}
                    />
                ) : (
                    <Stack className="border border-border p-4">
                        <Text as="p" compact className="text-muted-foreground">
                            Выберите техническое условие из списка справа.
                        </Text>
                    </Stack>
                )}
            </Column>
        </Grid>
    );
}

export default function TechnicalConditionsPage() {
    return (
        <DirtyGuardProvider confirmMessage="Есть несохраненные изменения. Смена ТУ недоступна.">
            <TechnicalConditionsPageContent />
        </DirtyGuardProvider>
    );
}
