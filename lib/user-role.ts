import type { User } from '@supabase/supabase-js';
import type { UserRole } from '../types';

export type { UserRole } from '../types';

const WHOLESALE_TYPES = ['dealer', 'contractor', 'shop_owner'];
const DROPSHIP_TYPES  = ['dropship'];

export function getRole(user: User | null): UserRole {
  if (!user) return 'guest';
  const type = user.app_metadata?.account_type as string | undefined;
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
