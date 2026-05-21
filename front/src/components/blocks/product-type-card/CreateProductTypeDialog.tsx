import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Stack, Text } from '@miracle/aramid';
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
import { InlineMutationNotification } from '@/components/ui/inline-mutation-notification';
import {
    DirtyGuardProvider,
    useGuardActions,
    useGuardState,
} from '@/contexts/dirty-state/DirtyGuardContext';
import { useField } from '@/contexts/dirty-state/useField';
import { parseSynonymsFromText } from '@/lib/product-type-synonyms';
import { useCreateProductType } from '@/lib/queries/product-type.query';
import { SynonymsPreview } from './SynonymsPreview';

function CreateProductTypeForm({
    onCreated,
}: {
    onCreated: () => void;
}) {
    const createMutation = useCreateProductType();
    const { isDirtyAnywhere } = useGuardState();
    const { commitAll, resetAll } = useGuardActions();

    const name = useField('name', '');
    const synonymsText = useField('synonymsText', '');

    const parsedSynonyms = useMemo(
        () => parseSynonymsFromText(synonymsText.value),
        [synonymsText.value],
    );

    const handleCreate = () => {
        const trimmedName = name.value.trim();
        if (!trimmedName) {
            return;
        }

        createMutation.mutate(
            { name: trimmedName, synonyms: parsedSynonyms },
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
                <Stack gap={1}>
                    <Text.Label as="span">Название</Text.Label>
                    <Input
                        id="new-product-type-name"
                        aria-label="Название нового типа продукции"
                        value={name.value}
                        onChange={name.onInputChange}
                        disabled={createMutation.isPending}
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
                                disabled={createMutation.isPending}
                                placeholder="муфта"
                                aria-label="Синонимы нового типа"
                            />
                        </div>
                        <div className="basis-[30%]">
                            <div className="min-w-0 border border-input/50 bg-muted/20 p-2">
                                <SynonymsPreview synonyms={parsedSynonyms} emptyLabel="" />
                            </div>
                        </div>
                    </div>
                </Stack>
                <InlineMutationNotification mutation={createMutation} />
            </Stack>
            <DialogFooter>
                <Button
                    variant="tertiary"
                    onClick={handleCancel}
                    disabled={createMutation.isPending}
                >
                    Отмена
                </Button>
                <Button
                    onClick={handleCreate}
                    disabled={
                        !isDirtyAnywhere
                        || !name.value.trim()
                        || createMutation.isPending
                    }
                >
                    {createMutation.isPending ? 'Создание...' : 'Создать'}
                </Button>
            </DialogFooter>
        </>
    );
}

export function CreateProductTypeDialog() {
    const [open, setOpen] = useState(false);

    const handleClose = () => {
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
                render={
                    <Button size={'sm'}>
                        <Plus />
                        Создать тип
                    </Button>
                }
            />
            <DialogContent size="medium">
                <DialogHeader>
                    <DialogTitle>Новый тип продукции</DialogTitle>
                </DialogHeader>
                {open && (
                    <DirtyGuardProvider id="create-product-type">
                        <CreateProductTypeForm onCreated={handleClose} />
                    </DirtyGuardProvider>
                )}
            </DialogContent>
        </Dialog>
    );
}
