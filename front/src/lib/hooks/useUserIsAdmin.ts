import { useAuthContext } from '@/contexts/AuthContext';
import { USER_ROLES } from '@miracle/types';

export function useUserIsAdmin(): boolean {
    const { role } = useAuthContext();
    return role === USER_ROLES.ADMIN;
}
