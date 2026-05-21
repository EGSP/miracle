import { Stack } from '@miracle/aramid';
import { Button } from '@/components/ui/button';
import { InlineMutationNotification } from '@/components/ui/inline-mutation-notification';
import { useGuardState } from '@/contexts/dirty-state/DirtyGuardContext';
import { useExtractTcDetails } from '@/lib/queries/technical-condition.query';
import { useTechnicalConditionCardContext } from './TechnicalConditionCardContext';

export function TechnicalConditionCardActions() {
    const { technicalCondition, isSaving, save, saveError } = useTechnicalConditionCardContext();
    const { isDirtyAnywhere } = useGuardState();

    const extractMutation = useExtractTcDetails(technicalCondition.id);

    return (
        <Stack gap={2}>
            <Stack orientation="horizontal" gap={2} className="items-center  flex-wrap">
                <Button
                    type="button"
                    size="sm"
                    disabled={!isDirtyAnywhere || isSaving}
                    onClick={save}
                >
                    {isSaving ? 'Сохранение...' : 'Сохранить ТУ'}
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="tertiary"
                    disabled={!technicalCondition.fileId || extractMutation.isPending}
                    title={
                        !technicalCondition.fileId
                            ? 'Сначала прикрепите PDF-файл ТУ'
                            : 'Запустить LLM-анализ: извлечь правила и слоты из текста ТУ'
                    }
                    onClick={() => extractMutation.mutate()}
                >
                    {extractMutation.isPending ? 'Запуск...' : 'Извлечь правила и слоты'}
                </Button>
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
