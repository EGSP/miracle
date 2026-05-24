import { useDialogStore } from '@/lib/stores/dialog.store';
import type { DialogRenderer } from '@/lib/stores/dialog.store';

export interface UseDialogReturn {
    open: (renderer: DialogRenderer) => void;
    close: () => void;
    isOpen: boolean;
}

export function useDialog(): UseDialogReturn {
    const open   = useDialogStore(s => s.open);
    const close  = useDialogStore(s => s.close);
    const isOpen = useDialogStore(s => s.isOpen);
    return { open, close, isOpen };
}
