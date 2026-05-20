import { Stack } from '@miracle/aramid';
import { Button } from '@/components/ui/button';
import { InlineMutationNotification } from '@/components/ui/inline-mutation-notification';
import { useGuardState } from '@/contexts/dirty-state/DirtyGuardContext';
import { useTechnicalConditionCardContext } from './TechnicalConditionCardContext';

export function TechnicalConditionCardActions() {
    const { isSaving, save, saveError } = useTechnicalConditionCardContext();
    const { isDirtyAnywhere } = useGuardState();

    return (
        <Stack orientation="horizontal" gap={2} className="items-center justify-end">
            <Button
                type="button"
                size="sm"
                disabled={!isDirtyAnywhere || isSaving}
                onClick={save}
            >
                {isSaving ? 'Сохранение...' : 'Сохранить ТУ'}
            </Button>
            <InlineMutationNotification
                mutation={{ isError: !!saveError, isSuccess: false, error: saveError }}
            />
        </Stack>
    );
}
