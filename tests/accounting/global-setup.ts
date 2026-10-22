import { config } from 'dotenv';
import path from 'node:path';
import { acquireTestDbLock } from '../shared/db-lock';
import { assertTestDatabase } from '../shared/test-db-guard';

// Те саме оточення, що й у setup.ts (test-проєкт, не прод)
config({ path: path.resolve(process.cwd(), '.env.test') });
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) config({ path: path.resolve(process.cwd(), '.env.local') });

/**
 * Один прогін інтеграційних тестів на тестову базу за раз — див. tests/shared/db-lock.
 * Повертає teardown, який звільняє замок, коли всі файли відпрацювали.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  assertTestDatabase();
  const release = await acquireTestDbLock('integration');
  return release;
}
