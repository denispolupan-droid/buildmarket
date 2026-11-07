import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Архітектурні правила з AGENTS.md, які інакше тримаються лише на пам'яті.
 * Не стиль, а межі: порушення кожного з них уже давало інцидент в обліку.
 *
 * 1. orders.status пишеться лише через lib/orders/status (transitionOrder /
 *    buildStatusPatch). 03.10.2026 статус «Відправлено», виставлений повз
 *    відгрузку, дав замовлення без видаткової (I7).
 * 2. money_entries не пишуться напряму — лише функція БД record_money_txn через
 *    lib/accounting (подвійний запис, ідемпотентність).
 * 3. Крон-роути авторизуються через cronAuthorized, а не порівнянням рядків із
 *    CRON_SECRET (без змінної те порівняння пропускало всіх).
 * 4. order_lines — дзеркало orders.items тригером БД (етап A, 31.10.2026): код у
 *    таблицю не пише, інакше I9 розійдеться з jsonb (docs/ORDER-LINES-PLAN.md).
 */

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'lib'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const files = SCAN_DIRS.flatMap(d => walk(path.join(ROOT, d)));
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, '/');
const read = (p: string) => readFileSync(p, 'utf8');

describe('архітектурні межі (AGENTS.md)', () => {
  it('orders.status пишеться лише в lib/orders/status.ts', () => {
    const allowed = new Set(['lib/orders/status.ts']);
    // .from('orders') … .update({ … status: '<літерал>' або status: змінна }) — у межах одного ланцюжка.
    // Вставки (insert) зі status: 'new' — створення замовлення, це не перехід статусу.
    const re = /\.from\(\s*['"]orders['"]\s*\)[\s\S]{0,400}?\.update\(\s*\{[^}]*\bstatus\s*:/g;
    const offenders: string[] = [];
    for (const f of files) {
      const r = rel(f);
      if (allowed.has(r)) continue;
      const src = read(f);
      for (const m of src.matchAll(re)) {
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${r}:${line}`);
      }
    }
    expect(offenders, 'пиши статус через transitionOrder/buildStatusPatch:\n' + offenders.join('\n')).toEqual([]);
  });

  it('money_entries не вставляються напряму поза lib/accounting', () => {
    const re = /\.from\(\s*['"]money_entries['"]\s*\)[\s\S]{0,200}?\.(insert|upsert|update|delete)\(/g;
    const offenders: string[] = [];
    for (const f of files) {
      const r = rel(f);
      if (r.startsWith('lib/accounting/')) continue;
      for (const m of read(f).matchAll(re)) offenders.push(`${r}:${read(f).slice(0, m.index).split('\n').length}`);
    }
    expect(offenders, 'леджер пишеться лише через record_money_txn у lib/accounting:\n' + offenders.join('\n')).toEqual([]);
  });

  it('крони перевіряють секрет через cronAuthorized', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const r = rel(f);
      if (!r.startsWith('app/api/cron/')) continue;
      const src = read(f);
      if (/!==\s*`Bearer \$\{process\.env\.CRON_SECRET\}`/.test(src)) offenders.push(r);
    }
    expect(offenders, 'використовуй cronAuthorized з lib/cron-auth:\n' + offenders.join('\n')).toEqual([]);
  });
  it('order_lines не пишуться з коду (дзеркало веде тригер БД)', () => {
    const re = /\.from\(\s*['"]order_lines['"]\s*\)[\s\S]{0,200}?\.(insert|upsert|update|delete)\(/g;
    const offenders: string[] = [];
    for (const f of files) {
      const src = read(f);
      for (const m of src.matchAll(re)) offenders.push(`${rel(f)}:${src.slice(0, m.index).split('\n').length}`);
    }
    expect(offenders, 'order_lines пише лише тригер trg_order_lines_mirror; правь orders.items:\n' + offenders.join('\n')).toEqual([]);
  });

  it('нові адмінські роути авторизуються через requireStaff (lib/auth-guard)', () => {
    // Старі роути з checkAdmin / ручним getUser зафіксовані в baseline і переводяться
    // поступово; тут ловимо лише НОВІ роути повз guard і нагадуємо прибрати з baseline
    // ті, що вже виправлені. Правило з AGENTS.md: ніколи не роби ad-hoc getUser.
    const baseline = JSON.parse(readFileSync(path.join(ROOT, 'tests', 'architecture-baseline.json'), 'utf8')) as { adminRoutesWithoutRequireStaff: string[] };
    const known = new Set(baseline.adminRoutesWithoutRequireStaff);
    const adminRoutes = files.map(rel).filter(r => r.startsWith('app/api/admin/') && r.endsWith('/route.ts'));
    const without = adminRoutes.filter(r => !read(path.join(ROOT, r)).includes('requireStaff'));
    const fresh = without.filter(r => !known.has(r));
    const fixed = [...known].filter(r => !without.includes(r));
    expect(fresh, 'новий роут повз requireStaff:\n' + fresh.join('\n')).toEqual([]);
    expect(fixed, 'ці роути вже на requireStaff — прибери їх із tests/architecture-baseline.json:\n' + fixed.join('\n')).toEqual([]);
  });

  it('серверні сторінки app/admin викликають requireStaffPage (lib/auth-guard)', () => {
    // 03.11.2026 (аудит, п. 14): layout адмінки пускає admin і manager, а 42 сторінки
    // (зокрема всі «Фінанси») не звужували доступ — менеджер бачив би банк, ОСВ, виписки.
    // Серверні компоненти тягнуть дані service-клієнтом, тож перевірка ролі має бути
    // в самій сторінці. Клієнтські ('use client') сторінки даних не тягнуть — їх не рахуємо.
    const offenders = files.map(rel)
      .filter(r => r.startsWith('app/admin/') && r.endsWith('/page.tsx'))
      .filter(r => { const src = read(path.join(ROOT, r)); return !/^\s*['"]use client['"]/.test(src) && !src.includes('requireStaffPage'); });
    expect(offenders, "додай `await requireStaffPage('admin'[, 'manager'])` на початку сторінки:\n" + offenders.join('\n')).toEqual([]);
  });

  it('обробники app/api експортуються через withApi (lib/api-handler): request-id, лог, алерт, 500', () => {
    // 03.11.2026: 146 із 291 роутів були без catch — необроблена помилка давала
    // порожній 500 без сліду в логах. Прямий `export async function GET` повз обгортку
    // повертає цю дірку; re-export (`export { GET } from …`) — допустимий.
    const re = /^export (async )?function (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\(/m;
    const offenders = files.map(rel)
      .filter(r => r.startsWith('app/api/') && r.endsWith('/route.ts'))
      .filter(r => re.test(read(path.join(ROOT, r))));
    expect(offenders, 'обгорни обробник: export const GET = withApi(\'<route>\', _GET):\n' + offenders.join('\n')).toEqual([]);
  });

  it('lib/accounting не імпортує модулі каналів напряму — лише lib/marketplace (ChannelFeeProvider)', () => {
    // 03.11.2026 (аудит, п. 17): completion.ts імпортував сім модулів Prom/Rozetka/Епіцентру —
    // двостороння зв'язність ядро ↔ канали; четверта площадка = правки в обліку.
    const re = /from '[./]*(prom-api|rozetka-api|epicentr-api|prom-commission|rozetka-commission|epicentr-commission|rozetka-smart|prom-delivery|prom-sync|rozetka-sync|epicentr-sync)'/;
    const offenders = files.map(rel)
      .filter(r => r.startsWith('lib/accounting/'))
      .filter(r => re.test(read(path.join(ROOT, r))));
    expect(offenders, 'збори/комісії площадок — через lib/marketplace/fees:\n' + offenders.join('\n')).toEqual([]);
  });

  it('секрети інтеграцій не читаються з app_settings напряму — лише lib/secrets (Vault)', () => {
    // 03.11.2026 (аудит, п. 14): токени лежали відкритим текстом в app_settings і
    // читались у 25 місцях. Тепер readSetting/writeSetting роутять їх у Vault; пряме
    // `.from('app_settings')…eq('key', '<секрет>')` повертає відкритий текст у таблицю.
    const secrets = ['np_api_key', 'prom_api_token', 'rozetka_password', 'rozetka_token', 'rozetka_api_token', 'rozetkapay_api_password', 'epicentr_api_token', 'rz_delivery_token', 'mono_personal_token', 'mono_webhook_secret', 'novapay_refresh_token', 'novapay_certificate', 'novapay_jwt', 'google_ads_client_secret', 'google_ads_developer_token', 'google_ads_refresh_token', 'EPICENTR_TOKEN_KEY', 'RZ_TOKEN_KEY', 'JWT_KEY', 'RZPAY_PASSWORD_KEY'];
    const re = new RegExp("app_settings['\"]\\)[^;]{0,120}(" + secrets.join('|') + ')');
    // 03.11.2026, інцидент з ТТН: np-sender читав усю таблицю (`select('key, value')`)
    // і брав `cfg.np_api_key` — перший патерн це не ловив. Після purge ключ порожній,
    // роут упав на env-ключ іншого кабінету → «Sender does not belong to this User».
    const dumpRe = /from\(\s*['"]app_settings['"]\s*\)\s*\.select\(\s*['"]key,\s*value['"]\s*\)(?![\s\S]{0,80}\.in\()/;
    const propRe = new RegExp('\\.(' + secrets.join('|') + ')\\b');
    const offenders: string[] = [];
    for (const f of files) {
      if (rel(f) === 'lib/secrets.ts') continue;
      const src = read(f);
      const m = src.match(re);
      if (m) offenders.push(`${rel(f)}:${src.slice(0, m.index).split('\n').length}`);
      // Дамп усієї таблиці + звернення до секретного ключа як до властивості —
      // дозволено лише loadSettings (settings-data), який домішує секрети з Vault
      if (rel(f) !== 'app/admin/settings/settings-data.ts' && dumpRe.test(src)) {
        const p = src.match(propRe);
        if (p) offenders.push(`${rel(f)}:${src.slice(0, p.index).split('\n').length} (дамп app_settings + .${p[1]})`);
      }
    }
    expect(offenders, 'читай/пиши секрет через readSetting/writeSetting з lib/secrets:\n' + offenders.join('\n')).toEqual([]);
  });

  it('прогноз прибутку в «Фінансах» — лише через lib/accounting/estimate, без своїх формул закупівля × ставка', () => {
    // 04.11.2026: «Огляд» і «Аналітика» мали по своїй копії оцінки (поточна закупівля
    // з product_stock + ставка категорії): Rozetka рахувалась плоскою ставкою замість
    // порогів, а на «Огляді» позиції губились і маржа показувала 93 %. Тепер оцінку дає
    // loadProfitEstimates; читання price_cost чи ставок комісій прямо в екранах фінансів —
    // ознака нової копії.
    const re = /price_cost|_commission_pct/;
    const offenders = files.map(rel)
      .filter(r => r.startsWith('app/admin/finance/'))
      .filter(r => re.test(read(path.join(ROOT, r)).replace(/\/\/[^\n]*/g, '')));
    expect(offenders, 'бери прогноз через loadProfitEstimates (lib/accounting/estimate):\n' + offenders.join('\n')).toEqual([]);
  });

  it('пуші статусу/ЕН на площадки з роутів замовлень — лише подіями outbox (lib/outbox/handlers)', () => {
    // 08.11.2026 (outbox, фаза 2): /ship, /confirm, картка й заміна ЕН пишуть події
    // (transitionOrder/applyOrderPatch), а виклики площадок робить обробник з
    // повторами і слідом. Прямий виклик з роуту повертає «вистрілив і забув».
    // Винятки: ручні кнопки «допушити зараз» (push-*-ttn), створення накладної
    // Rozetka Доставки і крони самолікування.
    const re = /\b(setPromTTN|setPromOrderStatus|setRozetkaOrderStatus|setRozetkaOrderStatusChained|setEpicentrOrderStatus|setEpicentrTTN)\s*\(/;
    const allow = new Set([
      'app/api/admin/orders/[id]/push-prom-ttn/route.ts',
      'app/api/admin/orders/[id]/push-rozetka-ttn/route.ts',
      'app/api/admin/orders/[id]/push-epicentr-ttn/route.ts',
      'app/api/admin/orders/[id]/rozetka-delivery-ttn/route.ts',
    ]);
    const offenders = files.map(rel)
      .filter(r => r.startsWith('app/api/admin/orders/') && !allow.has(r))
      .filter(r => re.test(read(path.join(ROOT, r)).replace(/\/\/[^\n]*/g, '')));
    expect(offenders, 'запиши подію через statusPushEvents/ttnPushEvents (lib/outbox/enqueue):\n' + offenders.join('\n')).toEqual([]);
  });

  it('ключ НП — лише через getNpApiKey (lib/np-api), не через process.env напряму', () => {
    // 03.11.2026: /api/novaposhta, delivery-sync і np-debug читали ЛИШЕ
    // process.env.NOVA_POSHTA_API_KEY (ключ іншого кабінету). Коли змінну прибрали,
    // модалка ТТН і вибір відділення на сайті лишились без довідника, а крон статусів
    // доставки — без ключа. Єдине місце з env-фолбеком — lib/np-api.ts.
    const offenders = files.map(rel)
      .filter(r => r !== 'lib/np-api.ts')
      .filter(r => /process\.env\.NOVA_POSHTA_API_KEY\b/.test(read(path.join(ROOT, r)).replace(/\/\/[^\n]*/g, '')));
    expect(offenders, 'бери ключ через getNpApiKey() з lib/np-api:\n' + offenders.join('\n')).toEqual([]);
  });
});


