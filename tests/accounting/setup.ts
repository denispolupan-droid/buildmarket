import { vi } from 'vitest';
import { config } from 'dotenv';
import path from 'path';

// Load test env vars (test project, not production)
config({ path: path.resolve(process.cwd(), '.env.test') });
// Fall back to .env.local if .env.test is missing
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  config({ path: path.resolve(process.cwd(), '.env.local') });
}

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidatePath:  vi.fn(),
  revalidateTag:   vi.fn(),
}));
