import { type ReactNode } from 'react';
import { Stack } from '@miracle/aramid';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ArrayEditorProps<T> = {
    items: T[];
    onAdd: () => void;
    onRemove: (index: number) => void;
    renderItem: (item: T, index: number) => ReactNode;
    addLabel?: string;
    disabled?: boolean;
    className?: string;
};

export function ArrayEditor<T>({
    items,
    onAdd,
    onRemove,
    renderItem,
    addLabel = 'Добавить',
    disabled,
    className,
}: ArrayEditorProps<T>) {
    return (
        <Stack gap={1} className={className}>
            {items.map((item, i) => (
                <div key={i} className="flex gap-1 items-end border border-border p-2">
                    <div className="flex-1 min-w-0">{renderItem(item, i)}</div>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onRemove(i)}
                        disabled={disabled}
                        aria-label="Удалить"
                    >
                        <Trash2 />
                    </Button>
                </div>
            ))}
            <Button
                variant="outline"
                size="sm"
                onClick={onAdd}
                disabled={disabled}
                className={cn('self-start', items.length > 0 && 'mt-1')}
            >
                <Plus />
                {addLabel}
            </Button>
        </Stack>
    );
}
