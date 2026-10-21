// Новий доступ до NovaPay після перевипуску в кабінеті: записує refresh token
// (і сертифікат, якщо дали) в app_settings і одразу перевіряє його оновленням виписки.
//   npx tsx --env-file=.env.local scripts/set-novapay-token.ts <refresh_token> [<файл сертифіката або сам сертифікат>]
import { existsSync, readFileSync } from 'node:fs';
import { createServiceClient } from '../lib/supabase';
import { ingestNovapayStatement, postNpPayouts } from '../lib/novapay-ingest';

(async () => {
  const [token, certArg] = process.argv.slice(2).map(s => s?.trim());
  // Сертифікат багаторядковий — зручніше передати шлях до файлу з ним
  const cert = certArg && existsSync(certArg) ? readFileSync(certArg, 'utf8').trim() : certArg;
  if (!token) { console.log('Вкажіть refresh token першим аргументом'); process.exit(1); }
  const db = createServiceClient();
  await db.from('app_settings').upsert({ key: 'novapay_refresh_token', value: token });
  if (cert) await db.from('app_settings').upsert({ key: 'novapay_certificate', value: cert });
  await db.from('app_settings').delete().eq('key', 'novapay_jwt');
  console.log('Записано. Перевіряю — оновлюю виписку…');
  try {
    console.log('Виписка:', JSON.stringify(await ingestNovapayStatement(5)));
    console.log('Наложки:', JSON.stringify(await postNpPayouts('script:set-novapay-token')));
    console.log('OK — доступ працює');
  } catch (err) {
    console.log('Не вийшло:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
})();
