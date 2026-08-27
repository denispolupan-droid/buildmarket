/**
 * Переотправка sitemap у Google Search Console + перевірка, коли Google його
 * востаннє читав.
 *
 * Навіщо: аудит 2026-08-27 показав, що після відправки 22.06 Google жодного
 * разу не перечитав sitemap (lastDownloaded = 2026-06-22), а lastmod у ньому
 * був однаковий у 1 680 URL із 1 888. Після деплою чесного lastmod карту треба
 * подати ще раз — це і є «кнопка» в GSC, тільки з консолі.
 *
 *   npx tsx --env-file=.env.local scripts/gsc-submit-sitemap.mts          # лише статус
 *   npx tsx --env-file=.env.local scripts/gsc-submit-sitemap.mts --submit # подати заново
 *
 * Потрібен GSC_SERVICE_ACCOUNT_KEY (той самий, що в lib/gsc.ts) з правами
 * «повний користувач» на sc-domain:fixline.com.ua.
 */
import crypto from 'node:crypto';

const SITE = 'sc-domain:fixline.com.ua';
const SITEMAP = 'https://fixline.com.ua/sitemap.xml';
const submit = process.argv.includes('--submit');

async function token(scope: string): Promise<string> {
  const raw = process.env.GSC_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('GSC_SERVICE_ACCOUNT_KEY не налаштований');
  const key = JSON.parse(raw) as { client_email: string; private_key: string };
  const b64 = (s: string) => Buffer.from(s).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64(JSON.stringify({ iss: key.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(key.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${header}.${claims}.${sig}`,
  });
  const json = await res.json() as { access_token?: string };
  if (!res.ok || !json.access_token) throw new Error(`GSC auth failed: ${res.status} ${JSON.stringify(json)}`);
  return json.access_token;
}

async function main() {
  const scope = submit ? 'https://www.googleapis.com/auth/webmasters' : 'https://www.googleapis.com/auth/webmasters.readonly';
  const t = await token(scope);
  const base = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/sitemaps/${encodeURIComponent(SITEMAP)}`;
  const headers = { Authorization: `Bearer ${t}` };

  const show = async (label: string) => {
    const res = await fetch(base, { headers });
    const j = await res.json() as { lastSubmitted?: string; lastDownloaded?: string; errors?: string; warnings?: string; contents?: { submitted: string; indexed: string }[] };
    console.log(`${label}: submitted ${j.lastSubmitted ?? '—'} | downloaded ${j.lastDownloaded ?? '—'} | errors ${j.errors ?? '?'} warnings ${j.warnings ?? '?'} | urls ${j.contents?.[0]?.submitted ?? '?'}`);
  };

  await show('до');
  if (submit) {
    const res = await fetch(base, { method: 'PUT', headers });
    if (!res.ok) throw new Error(`submit failed: ${res.status} ${await res.text()}`);
    console.log('sitemap подано заново');
    await show('після');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
