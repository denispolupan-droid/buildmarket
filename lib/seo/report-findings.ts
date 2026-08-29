// Чисті правила звіту: типи, класифікація сторінок і висновки.
//
// Окремим модулем — щоб покрити тестом, не тягнучи клієнт Supabase (а з ним і
// валідацію env). Тут немає жодного запиту до бази: на вхід уже пораховані
// числа, на вихід — текст, який побачить людина.

export type Metrics = { clicks: number; impressions: number; ctr: number; position: number };
export type Period = { from: string; to: string };

export type MonthRow = { month: string; days: number } & Metrics;
export type WeekRow = { week: string } & Metrics;

export type KindRow = {
  kind: string;
  impressions: number; clicks: number;
  prevImpressions: number; prevClicks: number;
  ctr: number; clickShare: number;
};

export type PageRow = {
  path: string; kind: string;
  impressions: number; clicks: number; position: number;
  prevImpressions: number; delta: number;
};

export type QueryRow = {
  query: string; impressions: number; clicks: number; position: number; prevImpressions: number;
};

export type OrderRow = { month: string; count: number; revenue: number; fromSite: number };

export type Finding = {
  tone: 'good' | 'warn' | 'info';
  title: string;
  text: string;
};


export const normPath = (p: string) => String(p).replace(/^https?:\/\/[^/]+/i, '').replace(/[?#].*$/, '') || '/';

/** Тип сторінки за адресою. Мовний префікс /ru не робить сторінку іншим типом. */
export function pageKind(p: string): string {
  const s = normPath(p).replace(/^\/ru/, '') || '/';
  if (s === '/') return 'Головна';
  if (s.startsWith('/product/')) return 'Товари';
  if (s.startsWith('/shop')) return 'Категорії';
  if (s.startsWith('/blog')) return 'Статті';
  return 'Інші';
}


const nf = (n: number) => Math.round(n).toLocaleString('uk-UA');
/** Десяткова кома: у тексті українською «2.9 раза» виглядає як недогляд. */
const dec = (n: number, digits = 1) => n.toFixed(digits).replace('.', ',');
/** 1 перехід · 2 переходи · 5 переходів */
function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.round(n));
  if (abs % 10 === 1 && abs % 100 !== 11) return one;
  if (abs % 10 >= 2 && abs % 10 <= 4 && (abs % 100 < 12 || abs % 100 > 14)) return few;
  return many;
}
const clicksWord = (n: number) => plural(n, 'перехід', 'переходи', 'переходів');
const queriesWord = (n: number) => plural(n, 'запит', 'запити', 'запитів');

/**
 * Висновки за правилами, а не за пам'яттю автора. Кожен має поріг: інакше через
 * місяць звіт упевнено повторював би торішні спостереження.
 */
export function buildFindings(d: {
  cur: Metrics; prev: Metrics; kinds: KindRow[];
  growth: PageRow[]; decline: PageRow[]; zeroClick: QueryRow[];
  pages: PageRow[]; days: number;
}): Finding[] {
  const out: Finding[] = [];

  // 1. Динаміка переходів
  if (d.prev.clicks > 0) {
    const ratio = d.cur.clicks / d.prev.clicks;
    if (ratio >= 1.25) {
      out.push({ tone: 'good', title: 'Трафік росте',
        text: `Переходів ${nf(d.cur.clicks)} проти ${nf(d.prev.clicks)} — у ${dec(ratio)} раза більше. Показів ${nf(d.cur.impressions)} проти ${nf(d.prev.impressions)}.` });
    } else if (ratio <= 0.8) {
      out.push({ tone: 'warn', title: 'Трафік просів',
        text: `Переходів ${nf(d.cur.clicks)} проти ${nf(d.prev.clicks)} за попередній такий самий період. Варто подивитись, які саме сторінки втратили покази.` });
    } else {
      out.push({ tone: 'info', title: 'Трафік тримається рівно',
        text: `Переходів ${nf(d.cur.clicks)} проти ${nf(d.prev.clicks)} — суттєвої зміни немає.` });
    }
  }

  // 2. Чому виріс: позиції чи сніпети
  const ctrDelta = d.cur.ctr - d.prev.ctr;
  const posDelta = d.prev.position - d.cur.position;
  if (Math.abs(ctrDelta) < 0.15 && posDelta > 1) {
    out.push({ tone: 'info', title: 'Ростуть покази, не клікабельність',
      text: `CTR майже не змінився (${dec(d.cur.ctr, 2)}% проти ${dec(d.prev.ctr, 2)}%), зате середня позиція піднялась з ${dec(d.prev.position)} на ${dec(d.cur.position)}. Тобто сайт стали показувати частіше й вище, а не краще клікати.` });
  } else if (ctrDelta >= 0.15) {
    out.push({ tone: 'good', title: 'Сніпети стали клікабельнішими',
      text: `CTR ${dec(d.cur.ctr, 2)}% проти ${dec(d.prev.ctr, 2)}% — з тієї самої кількості показів забираємо більше переходів.` });
  }

  // 3. Хто дає трафік
  const leader = [...d.kinds].sort((a, b) => b.clicks - a.clicks)[0];
  if (leader && leader.clickShare >= 40) {
    out.push({ tone: 'info', title: `Основне джерело — ${leader.kind.toLowerCase()}`,
      text: `${Math.round(leader.clickShare)}% усіх переходів (${nf(leader.clicks)} з ${nf(d.cur.clicks)}) дають сторінки цього типу.` });
  }

  // 4. Тип сторінок із попитом, але без кліків
  for (const k of d.kinds) {
    if (k.impressions >= 500 && k.ctr < 0.3) {
      out.push({ tone: 'warn', title: `${k.kind}: показують, але не клікають`,
        text: `${nf(k.impressions)} показів і лише ${nf(k.clicks)} ${clicksWord(k.clicks)} — CTR ${dec(k.ctr, 2)}%. Сторінки знаходять, але вони стоять надто низько, щоб до них доходили.` });
    }
  }

  // 5. Запити з нулем кліків
  const zc = d.zeroClick.filter(q => q.impressions >= 30);
  if (zc.length >= 3) {
    const total = zc.reduce((s, q) => s + q.impressions, 0);
    const avgPos = zc.reduce((s, q) => s + q.position * q.impressions, 0) / total;
    out.push({ tone: 'warn', title: 'Найближчий резерв — запити без жодного кліку',
      text: `${zc.length} ${queriesWord(zc.length)} зібрали ${nf(total)} показів і жодного переходу, середня позиція ${avgPos.toFixed(0)}. Найбільший — «${zc[0].query}» (${nf(zc[0].impressions)} показів). Ті самі запити на першій сторінці дадуть трафік без жодної нової статті.` });
  }

  // 6. Що вистрелило
  const top = d.growth[0];
  if (top && top.delta >= 200) {
    out.push({ tone: 'good', title: 'Найбільший приріст',
      text: `${top.path} — плюс ${nf(top.delta)} показів${top.prevImpressions === 0 ? ' з нуля' : ''}, позиція ${dec(top.position)}. Формат, який варто повторювати.` });
  }

  // 7. Що втратили
  const worst = d.decline[0];
  if (worst && worst.delta <= -100) {
    out.push({ tone: 'warn', title: 'Найбільша втрата',
      text: `${worst.path} — мінус ${nf(Math.abs(worst.delta))} показів. Видача не стоїть на місці: сторінки без роботи над ними поступово просідають.` });
  }

  // 8. Мовні пари: та сама стаття українською і російською
  const byPath = new Map(d.pages.map(p => [p.path, p]));
  let gap: { uk: PageRow; ru: PageRow } | null = null;
  for (const p of d.pages) {
    if (p.path.startsWith('/ru/')) continue;
    const ru = byPath.get('/ru' + p.path);
    if (!ru || p.impressions < 200) continue;
    if (p.impressions >= ru.impressions * 2 && (!gap || p.impressions > gap.uk.impressions)) {
      gap = { uk: p, ru };
    }
  }
  if (gap) {
    out.push({ tone: 'info', title: 'Російська версія відстає',
      text: `${gap.uk.path}: українська — ${nf(gap.uk.impressions)} показів і позиція ${dec(gap.uk.position)}, російська — ${nf(gap.ru.impressions)} і ${dec(gap.ru.position)}. Розрив не в попиті, а в опрацюванні сторінки.` });
  }

  return out;
}
