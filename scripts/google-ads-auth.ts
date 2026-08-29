/**
 * Одноразова авторизація в Google Ads API (OAuth2, loopback-потік).
 *
 * Google Ads НЕ приймає сервісні акаунти — лише доступ від імені людини. Тому
 * потрібен refresh-токен: користувач один раз підтверджує згоду, а далі код
 * оновлює access-токен сам.
 *
 * Скрипт піднімає локальний сервер на 127.0.0.1, друкує посилання згоди й чекає
 * на редірект від Google — так код авторизації не треба копіювати руками
 * (застарілий OOB-потік Google вимкнув ще у 2022-му). Отриманий refresh-токен
 * лягає в app_settings поруч з іншими креденшалами — керовано без редеплою.
 *
 * ВАЖЛИВО: поки застосунок у статусі Testing, refresh-токен живе 7 днів. Коли
 * почне протухати — або опублікувати застосунок у Cloud Console (одна кнопка,
 * перевірка не потрібна для неконфіденційних областей), або перезапустити цей
 * скрипт.
 *
 * Запуск: npx tsx --env-file=.env.local scripts/google-ads-auth.ts
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createServiceClient } from '../lib/supabase';

const PORT = 53682;                       // довільний вільний порт; для Desktop-клієнта
const REDIRECT = `http://127.0.0.1:${PORT}`;  // Google дозволяє будь-який loopback
const SCOPE = 'https://www.googleapis.com/auth/adwords';

async function setting(db: ReturnType<typeof createServiceClient>, key: string): Promise<string> {
  const { data } = await db.from('app_settings').select('value').eq('key', key).maybeSingle();
  const v = (data?.value ?? '').trim();
  if (!v) throw new Error(`У app_settings немає ${key}`);
  return v;
}

function b64url(b: Buffer): string {
  return b.toString('base64url');
}

/** Пара «посилання ↔ перевірка» з попереднього запуску, якщо вона ще свіжа. */
function readState(file: string, freshMs: number): { url: string; verifier: string } | null {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8')) as { url?: string; verifier?: string; at?: number };
    if (!s.url || !s.verifier || !s.at) return null;
    if (Date.now() - s.at > freshMs) return null;
    return { url: s.url, verifier: s.verifier };
  } catch {
    return null;
  }
}

async function main() {
  const db = createServiceClient();
  const clientId     = await setting(db, 'google_ads_client_id');
  const clientSecret = await setting(db, 'google_ads_client_secret');

  // PKCE: Google рекомендує його для встановлених застосунків, і він захищає
  // обмін коду, навіть якщо хтось підслухає редірект на localhost.
  //
  // Пару «перевірка ↔ посилання» зберігаємо на диск і перевикористовуємо, поки
  // вона свіжа. Інакше кожен перезапуск скрипта робив попереднє посилання
  // мертвим: людина відкриває те, що бачила в чаті, Google віддає код, а новий
  // процес не може його обміняти — «Invalid code verifier». Саме так і сталось.
  const stateFile = path.join(os.tmpdir(), 'google-ads-auth.json');
  const FRESH_MS = 30 * 60_000;

  let verifier: string;
  let url: URL;
  const prev = readState(stateFile, FRESH_MS);
  if (prev) {
    verifier = prev.verifier;
    url = new URL(prev.url);
    console.log('(використовую посилання з попереднього запуску — воно ще дійсне)');
  } else {
    verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', REDIRECT);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPE);
    // offline + consent — інакше Google віддасть лише access-токен на годину,
    // а refresh-токен не поверне взагалі (він видається раз на згоду).
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    fs.writeFileSync(stateFile, JSON.stringify({ url: url.toString(), verifier, at: Date.now() }), 'utf8');
  }

  // Дублюємо посилання у файл: при запуску у фоні stdout буферизується, і поки
  // процес чекає на згоду, у логах порожньо — саме тоді посилання й потрібне.
  const urlFile = path.join(os.tmpdir(), 'google-ads-auth-url.txt');
  fs.writeFileSync(urlFile, url.toString() + '\n', 'utf8');

  console.log('\n=== Відкрий це посилання і підтвердь доступ ===\n');
  console.log(url.toString());
  console.log(`\n(також збережено у ${urlFile})`);
  console.log('\nЧекаю на відповідь Google…\n');

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url ?? '/', REDIRECT);
      const err = u.searchParams.get('error');
      const got = u.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(err
        ? `<h2>Відмова: ${err}</h2><p>Можна закрити вкладку.</p>`
        : '<h2>Готово</h2><p>Доступ надано. Можна закрити вкладку і повернутись у термінал.</p>');
      server.close();
      if (err) reject(new Error(`Google повернув помилку: ${err}`));
      else if (got) resolve(got);
      else reject(new Error('Google не передав код авторизації'));
    });
    server.listen(PORT, '127.0.0.1');
    setTimeout(() => { server.close(); reject(new Error("Час очікування вичерпано (30 хв)")); }, 30 * 60_000);
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  const tok = await res.json() as { refresh_token?: string; access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !tok.refresh_token) {
    throw new Error(`Обмін коду не вдався: ${tok.error ?? res.status} ${tok.error_description ?? JSON.stringify(tok).slice(0, 200)}`);
  }

  const { error } = await db.from('app_settings').upsert({ key: 'google_ads_refresh_token', value: tok.refresh_token });
  if (error) throw new Error(`Не зберігся refresh-токен: ${error.message}`);
  console.log('refresh-токен збережено в app_settings ✓');
}

main().catch(e => { console.error('ВПАЛО:', e instanceof Error ? e.message : e); process.exit(1); });
