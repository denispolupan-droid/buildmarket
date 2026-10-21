import { createServiceClient } from './supabase';
import { alertAdmin } from './alert';
import { jwtSecondsLeft } from './novapay-jwt';
import { parseNovapayRegisterPayouts, type NovapayRegisterPayout } from './novapay-statement';

// NovaPay Business Cabinet API v2.0 (SOAP, business.novapay.ua).
// Автентифікація UserAuthenticationJWT з ОДНОРАЗОВОЮ РОТАЦІЄЮ: кожен виклик
// повертає НОВИЙ refresh_token і сертифікат — їх треба зберегти ДО використання
// jwt, інакше ланцюжок сесії рветься. Креденшали живуть в app_settings
// (novapay_login / novapay_refresh_token / novapay_certificate) — керовано без
// редеплою; кнопку «Згенерувати» в кабінеті після підключення НЕ натискати.

const SVC = 'https://business.novapay.ua/Services/ClientAPIService.svc';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Декодує XML-сутності відповіді. КРИТИЧНО для ротації: сервер віддає \r у
 *  сертифікаті як &#xD; — збережене сирим значення ламало наступну автентифікацію. */
function unesc(s: string): string {
  return s
    .replace(/&#x?[dD];/g, '')
    .replace(/&#13;/g, '')
    .replace(/&#x?[aA];/g, '\n')
    .replace(/&#10;/g, '\n')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Витягує текст першого тега з такою локальною назвою (незалежно від префікса ns) */
function tag(xml: string, local: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${local}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${local}>`));
  return m ? unesc(m[1]).trim() : null;
}

function tags(xml: string, local: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<(?:\\w+:)?${local}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${local}>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1].trim());
  return out;
}

async function soapCall(method: string, fields: Record<string, string | number | null | undefined>, timeoutMs = 120_000): Promise<string> {
  const body = Object.entries(fields)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `<tem:${k}>${esc(String(v))}</tem:${k}>`)
    .join('');
  const envelope =
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">` +
    `<soapenv:Header/><soapenv:Body><tem:${method}><tem:request>${body}</tem:request></tem:${method}></soapenv:Body></soapenv:Envelope>`;
  const res = await fetch(SVC, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: `http://tempuri.org/IClientAPIService/${method}`,
    },
    body: envelope,
    // NovaPay відповідає повільно (8–60+ с — виміряно), а обрив саме на
    // автентифікації коштує дорого: НП уже провернула ротацію, і збережений
    // refresh-токен стає мертвим назавжди. На 60 с ми ловили таймаут двічі за
    // сім викликів, тож ліміт щедрий — крон нікого не тримає.
    // 120 для звичайних викликів: у найгіршому сценарії (протух jwt) крон робить
    // два виклики поспіль, і 2×120 ще вкладається в maxDuration=300 роуту.
    // Автентифікація має власний, довший ліміт — див. AUTH_TIMEOUT_MS.
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`NovaPay ${method}: HTTP ${res.status} — ${text.slice(0, 300)}`);
  return text;
}

/** Обрив зв'язку (таймаут / впала мережа), а не відмова НП по суті запиту. */
function isTransportError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === 'TimeoutError'
    || err.name === 'AbortError'
    || err.name === 'TypeError'          // fetch failed
    || err.message.includes('fetch failed')
    || err.message.includes('ECONNRESET');
}

type Db = ReturnType<typeof createServiceClient>;

async function setting(db: Db, key: string): Promise<string | null> {
  const { data } = await db.from('app_settings').select('value').eq('key', key).maybeSingle();
  const v = (data?.value ?? '').trim();
  return v || null;
}

/**
 * Автентифікацію не обриваємо на 120 с, як звичайні виклики: 20.10.2026 НП
 * «висіла» (503), ми кинули запит на 120-й секунді, а НП ротацію таки провела —
 * новий токен загубився, і доступ стояв дві доби. Краще дочекатися повільної
 * відповіді: автентифікація йде першою в прогоні, тож 200 с ще лишають час.
 */
const AUTH_TIMEOUT_MS = 200_000;
const AUTH_RETRY_WITHIN_MS = 60_000;

/**
 * Одна спроба автентифікації конкретним токеном. Повертає jwt і те, що НП
 * видала на заміну; нічого не зберігає — рішення про запис ухвалює викликач.
 */
async function authOnce(login: string, refreshToken: string, certificate: string): Promise<{
  jwt: string; newToken: string | null; newCert: string | null;
}> {
  // request_ref один на обидві спроби — навмисно, див. коментар до повтору нижче.
  const ref = crypto.randomUUID();
  const fields = { request_ref: ref, refresh_token: refreshToken, login, public_certificate: certificate };

  let xml: string;
  const started = Date.now();
  try {
    xml = await soapCall('UserAuthenticationJWT', fields, AUTH_TIMEOUT_MS);
  } catch (err) {
    // Обрив саме на автентифікації — найдорожчий: НП уже провернула ротацію, а
    // нового токена ми не побачили, і ланцюжок мертвий назавжди (людині треба
    // перевипускати доступ у кабінеті — 26.08 це сталось утретє). Повторюємо з
    // ТИМ САМИМ request_ref: якщо НП вважає його ключем ідемпотентності, вона
    // віддасть ту саму пару токен/сертифікат і ланцюжок уціліє. Якщо ні —
    // гірше не стане: без повтору цей токен усе одно вже мертвий.
    // Повтор — лише якщо зв'язок упав швидко: після довгого очікування на
    // другу спробу вже немає часу в межах maxDuration роуту.
    if (!isTransportError(err) || Date.now() - started > AUTH_RETRY_WITHIN_MS) throw err;
    console.warn('[novapay] авторизація обірвалась — повтор із тим самим request_ref');
    xml = await soapCall('UserAuthenticationJWT', fields, AUTH_TIMEOUT_MS);
  }

  const jwt = tag(xml, 'jwt');
  if (tag(xml, 'result') === 'error' || !jwt) {
    throw new Error(`NovaPay auth failed: ${tag(xml, 'error') ?? tag(xml, 'error_description') ?? xml.slice(0, 300)}`);
  }
  return { jwt, newToken: tag(xml, 'refresh_token'), newCert: tag(xml, 'public_certificate') };
}

/**
 * JWT-автентифікація з ротацією. КРИТИЧНО: новий refresh_token/сертифікат
 * пишуться в app_settings ОДРАЗУ після відповіді — до будь-якого використання jwt.
 *
 * Токен одноразовий, тож ланцюжок рветься від будь-якої втрати відповіді: НП
 * уже видала наступний, а ми його не записали (процес прибили, мережа впала) —
 * і далі кожен виклик отримує «Refresh token does not apply to login», доки
 * людина не перевипустить токен у кабінеті. Двічі за добу саме так і сталось.
 * Тому попередній токен зберігаємо і пробуємо ним, якщо поточний відкинуто:
 * якщо ротація насправді не відбулась, ланцюжок відновлюється сам.
 */
async function authenticate(db: Db): Promise<string> {
  const [login, refreshToken, certificate, prevToken, prevCert] = await Promise.all([
    setting(db, 'novapay_login'),
    setting(db, 'novapay_refresh_token'),
    setting(db, 'novapay_certificate'),
    setting(db, 'novapay_refresh_token_prev'),
    setting(db, 'novapay_certificate_prev'),
  ]);
  if (!login || !refreshToken || !certificate) {
    throw new Error('NovaPay: креденшали не налаштовані (novapay_login / novapay_refresh_token / novapay_certificate в app_settings)');
  }

  let res: { jwt: string; newToken: string | null; newCert: string | null };
  let usedToken = refreshToken;
  let usedCert  = certificate;
  try {
    try {
      res = await authOnce(login, refreshToken, certificate);
    } catch (err) {
      if (!isRejectedToken(err) || !prevToken) throw err;
      console.warn('[novapay] поточний токен відкинуто — пробуємо попередній');
      usedToken = prevToken;
      usedCert  = prevCert || certificate;
      res = await authOnce(login, prevToken, usedCert);
    }
  } catch (err) {
    if (isRejectedToken(err)) await alertDeadToken(db);
    throw err;
  }

  // Ротація: зберігаємо новий ланцюжок ПЕРШИМ ділом, а той, яким щойно
  // скористались, лишаємо запасним — саме він рятує при втраченій відповіді.
  // Порядок важливий: спершу запасний, потім новий. Якщо процес обірветься між
  // цими двома записами, запасний уже на місці — а не навпаки.
  if (res.newToken) {
    await db.from('app_settings').upsert({ key: 'novapay_refresh_token_prev', value: usedToken });
    await db.from('app_settings').upsert({ key: 'novapay_refresh_token',      value: res.newToken });
  }
  if (res.newCert) {
    await db.from('app_settings').upsert({ key: 'novapay_certificate_prev', value: usedCert });
    await db.from('app_settings').upsert({ key: 'novapay_certificate',      value: res.newCert });
  }
  // Доступ живий — наступна смерть токена знову має дати сповіщення
  await db.from('app_settings').delete().eq('key', DEAD_ALERT_KEY);
  return res.jwt;
}

function isRejectedToken(err: unknown): boolean {
  return err instanceof Error && err.message.includes('Refresh token does not apply');
}

const DEAD_ALERT_KEY = 'novapay_token_dead_alerted';

/**
 * Обидва токени відкинуто — сам ланцюжок не відновиться, потрібна людина.
 * Кажемо про це ОДИН раз і прямо, що робити: 20.10.2026 замість цього щогодини
 * йшло «баланс не оновлюється», і доступ простояв дві доби.
 */
async function alertDeadToken(db: Db): Promise<void> {
  const { error } = await db.from('app_settings').insert({ key: DEAD_ALERT_KEY, value: new Date().toISOString() });
  if (error) return; // уже сповіщали
  alertAdmin('НовоПей: доступ API втрачено',
    'Ключ доступу НовоПей більше не приймається — виписка, наложки й баланс НовоПей не оновлюються. ' +
    'Перевипусти refresh token і сертифікат у кабінеті НовоПей (розділ API) і передай їх у Claude Code ' +
    '(scripts/set-novapay-token.ts).');
}

/* ── Блокування автентифікації ───────────────────────────────────────────────
   Два процеси з одним refresh-токеном (крон балансу й крон пошти, кнопка
   «Оновити») провернули б дві ротації, і одна з них убила б ланцюжок. Тож
   автентифікується лише власник рядка-блокування (insert по ключу атомарний),
   решта чекає й бере вже готовий jwt. */
const AUTH_LOCK_KEY = 'novapay_auth_lock';
const AUTH_LOCK_STALE_MS = AUTH_TIMEOUT_MS * 2 + 30_000;

async function acquireAuthLock(db: Db, waitMs: number): Promise<{ acquired: boolean; waited: boolean }> {
  const deadline = Date.now() + waitMs;
  let waited = false;
  for (;;) {
    const { error } = await db.from('app_settings').insert({ key: AUTH_LOCK_KEY, value: new Date().toISOString() });
    if (!error) return { acquired: true, waited };
    // Блокування від процесу, який помер, не дочекавшись відповіді
    const held = await setting(db, AUTH_LOCK_KEY);
    if (held && Date.now() - new Date(held).getTime() > AUTH_LOCK_STALE_MS) {
      await db.from('app_settings').delete().eq('key', AUTH_LOCK_KEY).eq('value', held);
      continue;
    }
    if (Date.now() > deadline) return { acquired: false, waited: true };
    waited = true;
    await new Promise(r => setTimeout(r, 5_000));
  }
}

export type NovapayLiveBalance = {
  available: number;    // доступний залишок, ₴ (сума по рахунках)
  projected: number;    // прогнозований (з урахуванням непідтверджених)
  fetchedAt: string;
};

const CACHE_KEY = 'novapay_balance_cache';

/**
 * Баланс NovaPay для сторінок: ЛИШЕ з кешу, без походу в API. NovaPay
 * відповідає по 8–30+ с на виклик — тримати на цьому рендер не можна.
 * Кеш наповнює refreshNovapayBalance() з крону.
 */
export async function getNovapayLiveBalance(): Promise<NovapayLiveBalance | null> {
  const db = createServiceClient();
  const { data: cached } = await db.from('app_settings').select('value').eq('key', CACHE_KEY).maybeSingle();
  if (!cached?.value) return null;
  try { return JSON.parse(cached.value) as NovapayLiveBalance; } catch { return null; }
}

const JWT_KEY = 'novapay_jwt';

/**
 * JWT для запиту: спершу збережений, і лише якщо його немає — нова
 * автентифікація (а отже й ротація refresh-токена).
 *
 * Це головний запобіжник проти втрати ланцюжка. Кожна автентифікація —
 * одноразова ротація, і якщо відповідь не доїхала (НП відповідає 8–60+ с і
 * час від часу не встигає), НП уже видала наступний токен, а в нас лишився
 * мертвий. Тричі за два дні ланцюжок гинув саме так. Поки jwt живий,
 * ротації не відбувається взагалі — тобто нема чого й губити.
 */
async function getJwt(db: Db, rejectedJwt?: string): Promise<string> {
  // 15 с запасу: виклик до НП іде 8–60 с, і jwt, якому лишилась секунда,
  // тільки змарнує його — а потім усе одно доведеться авторизуватись.
  // rejectedJwt — той, що НП щойно відкинула: його не повертаємо, навіть якщо
  // за часом він ще живий.
  const usable = (jwt: string | null) => jwtSecondsLeft(jwt) > 15 && jwt !== rejectedJwt;
  const cached = await setting(db, JWT_KEY);
  if (usable(cached)) return cached!;

  const lock = await acquireAuthLock(db, AUTH_TIMEOUT_MS + 20_000);
  try {
    // Поки чекали, інший процес міг уже автентифікуватись
    if (lock.waited) {
      const fresh = await setting(db, JWT_KEY);
      if (usable(fresh)) return fresh!;
    }
    if (!lock.acquired) throw new Error('NovaPay: інший процес автентифікується надто довго — пропускаємо прогін');
    const jwt = await authenticate(db);
    await db.from('app_settings').upsert({ key: JWT_KEY, value: jwt });
    return jwt;
  } finally {
    if (lock.acquired) await db.from('app_settings').delete().eq('key', AUTH_LOCK_KEY);
  }
}

/**
 * Помилка «протух jwt» — привід перевидати його, а не падати.
 * Живий текст НП саме такий: `<status>logic_error</status><title>User not
 * logged in. </title>`. Слова «jwt» чи «token» у ньому немає взагалі, тож
 * перша версія перевірки його не впізнавала і прогін просто падав.
 */
function isExpiredJwt(xml: string): boolean {
  const t = `${tag(xml, 'title') ?? ''} ${tag(xml, 'error') ?? ''} ${tag(xml, 'error_description') ?? ''}`.toLowerCase();
  return t.includes('not logged in')
    || t.includes('не авторизов')
    || t.includes('jwt')
    || t.includes('token')
    || t.includes('unauthorized')
    || t.includes('access denied');
}

/** id рахунків NovaPay (кеш novapay_account_ids; інакше — GetClientsList → GetAccountsList). */
async function resolveAccountIds(db: Db, jwt: string): Promise<number[]> {
  const cachedIds = await setting(db, 'novapay_account_ids');
  if (cachedIds) {
    try { const ids = JSON.parse(cachedIds) as number[]; if (ids.length) return ids; } catch { /* перечитаємо */ }
  }
  let clientId = await setting(db, 'novapay_client_id');
  if (!clientId) {
    const clientsXml = await soapCall('GetClientsList', { request_ref: crypto.randomUUID(), jwt });
    clientId = tag(clientsXml, 'id');
    if (clientId) await db.from('app_settings').upsert({ key: 'novapay_client_id', value: clientId });
  }
  if (!clientId) throw new Error('NovaPay: не знайдено підприємства в GetClientsList');
  const listXml = await soapCall('GetAccountsList', { request_ref: crypto.randomUUID(), jwt, client_id: clientId });
  const ids = tags(listXml, 'id').map(Number).filter(Number.isFinite);
  if (ids.length) await db.from('app_settings').upsert({ key: 'novapay_account_ids', value: JSON.stringify(ids) });
  return ids;
}

/** Виклик з одним повтором після перевидачі протухлого jwt. */
async function callWithJwt(db: Db, method: string, fields: Record<string, string | number | null | undefined>): Promise<string> {
  let jwt = await getJwt(db);
  let xml = await soapCall(method, { request_ref: crypto.randomUUID(), jwt, ...fields });
  if (tag(xml, 'result') === 'error' && isExpiredJwt(xml)) {
    jwt = await getJwt(db, jwt);
    xml = await soapCall(method, { request_ref: crypto.randomUUID(), jwt, ...fields });
  }
  if (tag(xml, 'result') === 'error') {
    throw new Error(`NovaPay ${method}: ${[tag(xml, "title"), tag(xml, "error"), tag(xml, "error_description"), tag(xml, "message")].filter(Boolean).join(" / ") || xml.slice(0, 300)}`);
  }
  return xml;
}

export type NovapayExtract = { accountId: number; extract: string };

/**
 * Виписка по рахунках NovaPay за період (GetAccountExtract: account_id, date_from,
 * date_to; відповідь — поле `extract` рядком). Саме тут видно виплати наложки
 * (COD) на рахунок і списання — джерело правди для «НоваПей тримає».
 * Дати — YYYY-MM-DD.
 */
export async function getNovapayAccountExtract(dateFrom: string, dateTo: string): Promise<NovapayExtract[]> {
  const db = createServiceClient();
  const jwt = await getJwt(db);
  const ids = await resolveAccountIds(db, jwt);
  const out: NovapayExtract[] = [];
  for (const id of ids) {
    // SOAP-операція GetAccountExtract (тип запиту в схемі — GetAccExtractRequest)
    const xml = await callWithJwt(db, 'GetAccountExtract', { account_id: id, date_from: dateFrom, date_to: dateTo });
    out.push({ accountId: id, extract: tag(xml, 'extract') ?? '' });
  }
  return out;
}

/** Список платежів за період (GetPaymentsList; date_type — за якою датою фільтр). Відповідь — рядок. */
export async function getNovapayPaymentsList(dateFrom: string, dateTo: string, dateType = 'DOC_DATE'): Promise<NovapayExtract[]> {
  const db = createServiceClient();
  const jwt = await getJwt(db);
  const ids = await resolveAccountIds(db, jwt);
  const out: NovapayExtract[] = [];
  for (const id of ids) {
    const xml = await callWithJwt(db, 'GetPaymentsList', { account_id: id, date_from: dateFrom, date_to: dateTo, date_type: dateType });
    out.push({ accountId: id, extract: tag(xml, 'payments') ?? '' });
  }
  return out;
}

/* ── Виплати наложки з виписки NovaPay ──────────────────────────────────────
   Кожна виплата COD приходить на рахунок NovaPay одним переказом за реєстром НП:
   «Переказ коштів по платежам, прийнятим від населення … згідно реєстру № N від
   DD.MM.YYYY». Складу реєстру (які ЕН) API не віддає (GetRegister → APIError,
   трекінг НП полів виплати для «Контролю оплати» не має), тож звідси беремо
   лише дати й суми реєстрів — для правила «вручено після останнього реєстру =
   ще не виплачено» на «Огляді». */

export type NovapayRegistersCache = { fetchedAt: string; from: string; to: string; lastDate: string | null; payouts: NovapayRegisterPayout[] };

const REGISTERS_CACHE_KEY = 'novapay_registers_cache';
const ddmmyyyy = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;

export async function getNovapayRegistersCache(): Promise<NovapayRegistersCache | null> {
  const db = createServiceClient();
  const { data } = await db.from('app_settings').select('value').eq('key', REGISTERS_CACHE_KEY).maybeSingle();
  if (!data?.value) return null;
  try { return JSON.parse(data.value) as NovapayRegistersCache; } catch { return null; }
}

/** Оновлення кешу реєстрів за останні `days` днів (кличе крон novapay-balance). */
export async function refreshNovapayRegisters(days = 14): Promise<NovapayRegistersCache | null> {
  const db = createServiceClient();
  try {
    const to = new Date(); const from = new Date(Date.now() - days * 86400000);
    const extracts = await getNovapayAccountExtract(ddmmyyyy(from), ddmmyyyy(to));
    const payouts = extracts.flatMap(e => parseNovapayRegisterPayouts(e.extract));
    const cache: NovapayRegistersCache = {
      fetchedAt: new Date().toISOString(),
      from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10),
      lastDate: payouts.length ? payouts[payouts.length - 1].date : null,
      payouts,
    };
    await db.from('app_settings').upsert({ key: REGISTERS_CACHE_KEY, value: JSON.stringify(cache) });
    return cache;
  } catch (err) {
    console.error('[novapay-registers]', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Реєстри НП (GetRegister → statement_id, DownloadRegister → url файлу).
 * Type — тип реєстру (перебір значень, документації на enum немає), дати —
 * DD.MM.YYYY, FileExtension — xlsx/csv. Клієнт — novapay_client_id.
 */
export async function requestNovapayRegister(type: number, from: string, into: string, fileExtension = 'xlsx'): Promise<{ statementId: string | null; createdAt: string | null; raw: string }> {
  const db = createServiceClient();
  let clientId = await setting(db, 'novapay_client_id');
  if (!clientId) { const jwt = await getJwt(db); await resolveAccountIds(db, jwt); clientId = await setting(db, 'novapay_client_id'); }
  if (!clientId) throw new Error('NovaPay: novapay_client_id невідомий');
  const xml = await callWithJwt(db, 'GetRegister', { Type: type, ClientId: Number(clientId), From: from, Into: into, FileExtension: fileExtension });
  return { statementId: tag(xml, 'statement_id'), createdAt: tag(xml, 'created_datetime'), raw: xml };
}

export async function downloadNovapayRegister(type: number, id: number): Promise<{ status: string | null; url: string | null; fileType: string | null; fileName: string | null; raw: string }> {
  const db = createServiceClient();
  const xml = await callWithJwt(db, 'DownloadRegister', { Type: type, Id: id });
  return { status: tag(xml, 'status'), url: tag(xml, 'url'), fileType: tag(xml, 'file_type'), fileName: tag(xml, 'file_name'), raw: xml };
}

/** Оновлення кешу балансу (кличе крон). */
export async function refreshNovapayBalance(): Promise<NovapayLiveBalance | null> {
  const db = createServiceClient();
  try {
    let jwt = await getJwt(db);

    // Рахунки: підприємство → рахунки (GetAccountsList вимагає client_id);
    // id кешуємо, щоб не смикати повільні списки щоразу
    let accountIds: number[] = [];
    const cachedIds = await setting(db, 'novapay_account_ids');
    if (cachedIds) {
      try { accountIds = JSON.parse(cachedIds) as number[]; } catch { /* перечитаємо */ }
    }
    if (!accountIds.length) {
      let clientId = await setting(db, 'novapay_client_id');
      if (!clientId) {
        const clientsXml = await soapCall('GetClientsList', { request_ref: crypto.randomUUID(), jwt });
        clientId = tag(clientsXml, 'id');
        if (clientId) await db.from('app_settings').upsert({ key: 'novapay_client_id', value: clientId });
      }
      if (!clientId) throw new Error('NovaPay: не знайдено підприємства в GetClientsList');
      const listXml = await soapCall('GetAccountsList', { request_ref: crypto.randomUUID(), jwt, client_id: clientId });
      accountIds = tags(listXml, 'id').map(Number).filter(Number.isFinite);
      if (accountIds.length) await db.from('app_settings').upsert({ key: 'novapay_account_ids', value: JSON.stringify(accountIds) });
    }
    if (!accountIds.length) throw new Error('NovaPay: не знайдено жодного рахунку в GetAccountsList');

    let available = 0, projected = 0, okAccounts = 0;
    for (const id of accountIds) {
      let xml = await soapCall('GetAccountRest', { request_ref: crypto.randomUUID(), jwt, account_id: id });
      // Збережений jwt протух — перевидаємо один раз і повторюємо запит.
      if (tag(xml, 'result') === 'error' && isExpiredJwt(xml)) {
        jwt = await getJwt(db, jwt);
        xml = await soapCall('GetAccountRest', { request_ref: crypto.randomUUID(), jwt, account_id: id });
      }
      if (tag(xml, 'result') === 'error') continue;
      available += Number(tag(xml, 'available_balance') ?? 0);
      projected += Number(tag(xml, 'projected_balance') ?? tag(xml, 'available_balance') ?? 0);
      okAccounts++;
    }

    // Жоден рахунок не відповів — це збій, а не нульовий залишок. Раніше такий
    // прогін клав у кеш «0 ₴», і «Огляд» показував його як живий: нуль на
    // рахунку виглядає достовірніше за стару цифру, хоча насправді це порожнеча.
    // Живий випадок: підряд із таймаутами НП один виклик віддав саме 0.
    if (okAccounts === 0) {
      throw new Error(`NovaPay: жоден із ${accountIds.length} рахунків не віддав залишок`);
    }

    const result: NovapayLiveBalance = {
      available: Math.round(available * 100) / 100,
      projected: Math.round(projected * 100) / 100,
      fetchedAt: new Date().toISOString(),
    };
    await db.from('app_settings').upsert({ key: CACHE_KEY, value: JSON.stringify(result) });
    return result;
  } catch (err) {
    console.error('[novapay-balance]', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Сирий виклик операції з jwt (діагностика невідомих операцій: реєстри, обороти). Повертає XML відповіді. */
export async function novapayRawCall(method: string, fields: Record<string, string | number | null | undefined>): Promise<string> {
  const db = createServiceClient();
  const jwt = await getJwt(db);
  return soapCall(method, { request_ref: crypto.randomUUID(), jwt, ...fields });
}
