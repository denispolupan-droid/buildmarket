import type { User } from '@supabase/supabase-js';

export type UserRole = 'wholesale' | 'retail' | 'dropship' | 'guest';

const WHOLESALE_TYPES = ['dealer', 'contractor', 'shop_owner'];
const DROPSHIP_TYPES  = ['dropship'];

export function getRole(user: User | null): UserRole {
  if (!user) return 'guest';
  const type = user.user_metadata?.account_type as string | undefined;
  if (DROPSHIP_TYPES.includes(type ?? ''))  return 'dropship';
  if (WHOLESALE_TYPES.includes(type ?? '')) return 'wholesale';
  return 'retail';
}

export function isWholesale(user: User | null): boolean {
  return getRole(user) === 'wholesale';
}

export function isDropship(user: User | null): boolean {
  return getRole(user) === 'dropship';
}
