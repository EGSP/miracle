import { Stack } from '@miracle/aramid';
import { Button } from '@/components/ui/button';
import { InlineMutationNotification } from '@/components/ui/inline-mutation-notification';
import { useGuardState } from '@/contexts/dirty-state/DirtyGuardContext';
import { useExtractTcDetails } from '@/lib/queries/technical-condition.query';
import { useTechnicalConditionCardContext } from './TechnicalConditionCardContext';
import { ScanEye, ScanLine, ScanText } from 'lucide-react';

export function TCCActions() {
    const { technicalCondition, isSaving, save, saveError } = useTechnicalConditionCardContext();
    const { isDirtyAnywhere } = useGuardState();

    const extractMutation = useExtractTcDetails(technicalCondition.id);

    return (
        <Stack gap={2}>
            <Stack orientation="horizontal" gap={2} className="items-center  flex-wrap">
                <Button
                    type="button"
                    size="md"
                    label={isSaving ? 'Сохранение...' : 'Сохранить ТУ'}
                    disabled={!isDirtyAnywhere || isSaving}
                    onClick={save}
                />
                <Button
                    type="button"
                    size="md"
                    variant="secondary"
                    icon={<ScanText />}
                    label={extractMutation.isPending ? 'Запуск...' : 'Сканировать'}
                    disabled={!technicalCondition.fileId || extractMutation.isPending}
                    title={
                        !technicalCondition.fileId
                            ? 'Сначала прикрепите PDF-файл ТУ'
                            : 'Запустить LLM-анализ: извлечь правила и слоты из текста ТУ'
                    }
                    onClick={() => extractMutation.mutate()}
                />
            </Stack>

            <InlineMutationNotification
                mutation={{
                    isError: extractMutation.isError,
                    isSuccess: extractMutation.isSuccess,
                    error: extractMutation.error,
                }}
                successMessage="Воркер запущен — статус виден на странице Воркеры"
            />

            <InlineMutationNotification
                mutation={{ isError: !!saveError, isSuccess: false, error: saveError }}
            />
        </Stack>
    );
}
