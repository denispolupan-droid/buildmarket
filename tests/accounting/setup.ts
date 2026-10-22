import { vi } from 'vitest';
import { config } from 'dotenv';
import path from 'path';
import { assertTestDatabase } from '../shared/test-db-guard';

// Load test env vars (test project, not production)
config({ path: path.resolve(process.cwd(), '.env.test') });
// Fall back to .env.local if .env.test is missing
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  config({ path: path.resolve(process.cwd(), '.env.local') });
}
// .env.local — це прод: якщо дійшло до нього, тест має впасти, а не писати в бойову базу
assertTestDatabase();

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidatePath:  vi.fn(),
  revalidateTag:   vi.fn(),
}));
