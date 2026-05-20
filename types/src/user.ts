import type { UserRole } from './user-role.js';

export type User = {
  id?: string;
  login?: string;
  role?: UserRole;
};