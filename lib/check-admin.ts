import { createSupabaseServer } from './supabase-server';

/**
 * Server-side admin check — use in every /api/admin/* route handler.
 * Returns true only for authenticated users with role === 'admin'.
 */
export async function checkAdmin(): Promise<boolean> {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.app_metadata?.role === 'admin';
  } catch {
    return false;
  }
}
