import { Stack, Text } from '@miracle/aramid';
import type { Stored, TechnicalCondition } from '@miracle/types';
import { Input } from '@/components/ui/input';
import { useContribute } from '@/contexts/draft-api/DraftContext';
import { useField } from '@/contexts/dirty-state/useField';
import { useTechnicalConditionCardContext } from './TechnicalConditionCardContext';

export function TechnicalConditionCardMeta() {
    const { technicalCondition, contribute, isSaving } = useTechnicalConditionCardContext();
    const tc = technicalCondition;

    const fileId = useField(`tc-${tc.id}-fileId`, tc.fileId);
    const productTypeId = useField(`tc-${tc.id}-productTypeId`, tc.productTypeId);

    useContribute(contribute, `tc-${tc.id}-meta`, (draft: Stored<TechnicalCondition>) => ({
        ...draft,
        fileId: fileId.value.trim(),
        productTypeId: productTypeId.value.trim(),
    }));

    return (
        <Stack gap={2}>
            <Text.Label as="span" className="font-medium">
                Основные поля
            </Text.Label>
            <Stack gap={1}>
                <Text.Label as="span">fileId (файл ТУ)</Text.Label>
                <Input
                    value={fileId.value}
                    onChange={fileId.onInputChange}
                    disabled={isSaving}
                    aria-label="Идентификатор файла ТУ"
                />
            </Stack>
            <Stack gap={1}>
                <Text.Label as="span">productTypeId</Text.Label>
                <Input
                    value={productTypeId.value}
                    onChange={productTypeId.onInputChange}
                    disabled={isSaving}
                    aria-label="Идентификатор типа продукции"
                />
            </Stack>
        </Stack>
    );
}
