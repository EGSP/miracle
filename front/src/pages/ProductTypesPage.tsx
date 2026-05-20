import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Column, Grid, Stack, Text } from '@miracle/aramid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { ProductTypeCard } from '@/components/blocks/product-type-card/ProductTypeCard';
import { InlineMutationNotification } from '@/components/ui/inline-mutation-notification';
import { parseSynonymsFromText } from '@/lib/product-type-synonyms';
import { useCreateProductType, useProductTypes } from '@/lib/queries/product-type.query';

export default function ProductTypesPage() {
    const { data: productTypes, isLoading, error } = useProductTypes();
    const createMutation = useCreateProductType();

    const [createOpen, setCreateOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newSynonymsText, setNewSynonymsText] = useState('');

    const parsedNewSynonyms = useMemo(
        () => parseSynonymsFromText(newSynonymsText),
        [newSynonymsText],
    );

    const resetCreateForm = () => {
        setNewName('');
        setNewSynonymsText('');
    };

    const handleCreate = () => {
        const name = newName.trim();
        if (!name) {
            return;
        }

        createMutation.mutate(
            { name, synonyms: parsedNewSynonyms },
            {
                onSuccess: () => {
                    resetCreateForm();
                    setCreateOpen(false);
                },
            },
        );
    };

    return (
        <Grid as="main" withRowGap>
            <Column span={16}>
                <Stack orientation="horizontal" gap={3} className="items-center justify-between">
                    <Text.Heading as="h1" variant="02">
                        Типы продукции
                    </Text.Heading>
                    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                        <DialogTrigger
                            render={
                                <Button>
                                    <Plus />
                                    Создать тип
                                </Button>
                            }
                        />
                        <DialogContent size="medium">
                            <DialogHeader>
                                <DialogTitle>Новый тип продукции</DialogTitle>
                            </DialogHeader>
                            <Stack gap={3}>
                                <Stack gap={1}>
                                    <Text.Label as="span">Название</Text.Label>
                                    <Input
                                        id="new-product-type-name"
                                        aria-label="Название нового типа продукции"
                                        value={newName}
                                        onChange={(event) => setNewName(event.target.value)}
                                        disabled={createMutation.isPending}
                                    />
                                </Stack>
                                <Stack gap={1}>
                                    <Text.Label as="span">Синонимы</Text.Label>
                                    <Text.Helper as="p">По одному синониму на строку</Text.Helper>
                                    <Textarea
                                        size="md"
                                        value={newSynonymsText}
                                        onChange={(event) => setNewSynonymsText(event.target.value)}
                                        disabled={createMutation.isPending}
                                        placeholder="муфта"
                                        aria-label="Синонимы нового типа"
                                    />
                                    {parsedNewSynonyms.length > 0 && (
                                        <Stack as="ul" gap={1} className="list-inside list-disc pl-1">
                                            {parsedNewSynonyms.map((synonym) => (
                                                <li key={synonym}>
                                                    <Text as="span" compact>
                                                        {synonym}
                                                    </Text>
                                                </li>
                                            ))}
                                        </Stack>
                                    )}
                                </Stack>
                                <InlineMutationNotification mutation={createMutation} />
                            </Stack>
                            <DialogFooter>
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        resetCreateForm();
                                        setCreateOpen(false);
                                    }}
                                    disabled={createMutation.isPending}
                                >
                                    Отмена
                                </Button>
                                <Button
                                    onClick={handleCreate}
                                    disabled={!newName.trim() || createMutation.isPending}
                                >
                                    {createMutation.isPending ? 'Создание...' : 'Создать'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </Stack>
            </Column>

            <Column span={16}>
                {isLoading && <Text.Label as="p">Загрузка...</Text.Label>}
                {error && (
                    <Text as="p" compact className="text-destructive">
                        Ошибка: {error.message}
                    </Text>
                )}
                {!isLoading && !error && productTypes?.length === 0 && (
                    <Text.Label as="p">Типы продукции ещё не созданы</Text.Label>
                )}
                {productTypes && productTypes.length > 0 && (
                    <Stack gap={3}>
                        {productTypes.map((item) => (
                            <ProductTypeCard key={item.id} productType={item} />
                        ))}
                    </Stack>
                )}
            </Column>
        </Grid>
    );
}
