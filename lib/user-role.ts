import type { User } from '@supabase/supabase-js';

export type UserRole = 'wholesale' | 'retail' | 'guest';

const WHOLESALE_TYPES = ['dealer', 'wholesale', 'contractor'];

export function getRole(user: User | null): UserRole {
  if (!user) return 'guest';
  const type = user.user_metadata?.account_type as string | undefined;
  return WHOLESALE_TYPES.includes(type ?? '') ? 'wholesale' : 'retail';
}

export function isWholesale(user: User | null): boolean {
  return getRole(user) === 'wholesale';
}
