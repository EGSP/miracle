import { useMemo } from 'react';
import type { FileWithMeta } from '@miracle/types';
import { useAuthContext } from '@/contexts/AuthContext';

export type FileFilters = {
    myFilesOnly: boolean;
    availableOnly: boolean | undefined;
    isTechnicalCondition: boolean | undefined;
};

export function useFilteredFiles(files: FileWithMeta[] | undefined, filters: FileFilters): FileWithMeta[] {
    const { userId } = useAuthContext();

    return useMemo(() => {
        if (!files) {
            return [];
        }

        let result = files;

        if (filters.myFilesOnly) {
            result = result.filter((file) => file.authorId === userId);
        }

        if (filters.availableOnly === true) {
            result = result.filter((file) => file.meta?.available === true);
        } else if (filters.availableOnly === false) {
            result = result.filter((file) => file.meta?.available === false);
        }

        if (filters.isTechnicalCondition !== undefined) {
            const flag = filters.isTechnicalCondition;
            result = result.filter((file) => (file.settings?.isTechnicalCondition ?? false) === flag);
        }

        return result;
    }, [files, filters.availableOnly, filters.isTechnicalCondition, filters.myFilesOnly, userId]);
}
