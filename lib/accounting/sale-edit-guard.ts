/**
 * Правила безпеки для ручної правки продажу (позиції/ціни/дата).
 *
 * Навіщо. Позиції замовлення можна правити з трьох місць: картка замовлення,
 * рахунок на оплату і видаткова-чернетка. Усі три пишуть в одні й ті самі
 * дані, з яких потім рахуються виручка, COGS і комісія маркетплейсу. Поки
 * правил не було, помилкова правка їхала мовчки: код бачив, що синхронізувати
 * рядки вже проведеної РН не можна, і... просто слав лист.
 *
 * Функція чиста навмисно (AGENTS.md: гроші — в тестованій функції): факти з
 * БД збирає викликач, тут лише рішення. Так правило можна перевірити тестом,
 * а не «на живому замовленні».
 *
 * РЕЖИМ. Зараз EDIT_GUARD_ENFORCE = false: жодна правка не блокується, усі
 * знахідки лише пишуться в журнал і показуються менеджерові. Це навмисно —
 * спочатку кілька тижнів дивимось, що реально спрацьовує на живій роботі, і
 * лише правила без хибних спрацювань переводимо в заборону, перемкнувши цей
 * прапорець. Ціна помилки в блокуванні висока: якщо правка стане незручною,
 * документи почнуть робити в Excel повз систему.
 */

export const EDIT_GUARD_ENFORCE = false;

export type SaleEditSource = 'order-card' | 'invoice' | 'sale-doc';

export type SaleEditIssue = {
  code: string;
  /** block — правка ламає облік; warn — може бути навмисною, але має бути видною. */
  level: 'block' | 'warn';
  message: string;
};

export type SaleEditFacts = {
  source: SaleEditSource;
  /** Скільки проведених/чернеткових РН уже є по цьому замовленню. */
  confirmedDocs: number;
  draftDocs: number;
  /** Скільки грошей уже отримано по замовленню. */
  amountPaid: number;
  channelCode: string | null;
  /** Закриті місяці у форматі YYYY-MM. */
  closedPeriods: string[];
  totalBefore: number;
  totalAfter: number;
  /** ISO-дати документа/замовлення. dateAfter === null — дату не міняли. */
  dateBefore: string | null;
  dateAfter: string | null;
  now: Date;
};

export type SaleEditVerdict = {
  issues: SaleEditIssue[];
  blockers: SaleEditIssue[];
  warnings: SaleEditIssue[];
  /** Чи пропускаємо правку з урахуванням поточного режиму. */
  allowed: boolean;
};

/** Помітна зміна суми — і у відсотках, і в гривнях: 30% від 300 грн це шум. */
const BIG_CHANGE_PCT = 0.3;
const BIG_CHANGE_UAH = 500;
/** Доба допуску на дату: часовий пояс клієнта не має вважатись «майбутнім». */
const FUTURE_TOLERANCE_MS = 86_400_000;

const MARKETPLACE_CHANNELS = ['prom', 'rozetka'];

/** Місяць у київському часі: 1 серпня 01:00 Києва — це ще 31 липня за UTC. */
export function kyivMonth(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d).slice(0, 7);
}

export function evaluateSaleEdit(f: SaleEditFacts): SaleEditVerdict {
  const issues: SaleEditIssue[] = [];
  const add = (code: string, level: 'block' | 'warn', message: string) => issues.push({ code, level, message });

  // 1. Проведена РН. Рухи складу, виручка й COGS уже зроблені; переписати
  // позиції означає, що надрукована накладна перестане відповідати проводкам.
  if (f.confirmedDocs > 0) {
    add('confirmed_sale_doc', 'block',
      'Видаткова по цьому замовленню вже проведена. Щоб змінити склад — «Виправити»: вона сторнується, правки вносяться в нову чернетку.');
  }

  // 2. Мультипосилка: незрозуміло, до якої з чернеток віднести правку, тож
  // автоматична синхронізація рядків свідомо відмовляється працювати.
  if (f.confirmedDocs === 0 && f.draftDocs > 1) {
    add('multiple_draft_parcels', 'block',
      'По замовленню кілька видаткових-чернеток (мультипосилка) — правку не можна рознести автоматично, оновіть потрібну накладну вручну.');
  }

  // 3. Сума нижча за вже отримані гроші. Буває законно (зменшили замовлення
  // після передоплати — різницю повертаємо), але мовчки такого бути не має.
  if (f.amountPaid > 0 && f.totalAfter < round2(f.amountPaid) - 0.01) {
    add('below_paid', 'warn',
      `Нова сума ${money(f.totalAfter)} менша за вже оплачені ${money(f.amountPaid)} — з'явиться переплата, її треба повернути або зарахувати.`);
  }

  // 4. Закритий період. Закритий місяць — це «дата заборони редагування»:
  // за нього вже відзвітувались, і вносити правки туди не можна ні новою
  // датою, ні перенесенням документа зі старої.
  const closed = new Set(f.closedPeriods);
  const monthBefore = f.dateBefore ? kyivMonth(f.dateBefore) : '';
  const monthAfter = f.dateAfter ? kyivMonth(f.dateAfter) : '';
  const hitClosed = [monthBefore, monthAfter].filter(m => m && closed.has(m));
  if (hitClosed.length) {
    add('closed_period', 'block',
      `Період ${[...new Set(hitClosed)].join(', ')} закрито — правки документів цим місяцем заборонені.`);
  }

  // 5. Дата в майбутньому — завжди помилка вводу, а не намір.
  if (f.dateAfter) {
    const t = new Date(f.dateAfter).getTime();
    if (!Number.isNaN(t) && t > f.now.getTime() + FUTURE_TOLERANCE_MS) {
      add('future_date', 'block', 'Дата документа в майбутньому.');
    }
  }

  // 6. Заднім числом у попередній місяць — не заборона, але саме так тихо
  // «їде» звітність: сума потрапляє в місяць, який уже дивилися.
  if (monthAfter && monthBefore && monthAfter !== monthBefore) {
    const nowMonth = kyivMonth(f.now);
    if (monthAfter < nowMonth) {
      add('backdated', 'warn', `Документ переноситься в ${monthAfter} — звіт за цей місяць зміниться.`);
    }
  }

  // 7. Замовлення маркетплейсу: його позиції — дзеркало кабінету. Локальна
  // правка розходиться з площадкою, і наступний синк може її перетерти.
  if (f.channelCode && MARKETPLACE_CHANNELS.includes(f.channelCode)) {
    add('marketplace_order', 'warn',
      'Замовлення з маркетплейсу: у кабінеті площадки лишиться стара сума, а синхронізація може перетерти правку.');
  }

  // 8. Різка зміна суми — найчастіший слід випадкової правки кількості.
  const delta = round2(f.totalAfter - f.totalBefore);
  if (f.totalBefore > 0 && Math.abs(delta) >= BIG_CHANGE_UAH
      && Math.abs(delta) / f.totalBefore >= BIG_CHANGE_PCT) {
    add('big_total_change', 'warn',
      `Сума змінюється на ${delta > 0 ? '+' : ''}${money(delta)} (${money(f.totalBefore)} → ${money(f.totalAfter)}).`);
  }

  const blockers = issues.filter(i => i.level === 'block');
  const warnings = issues.filter(i => i.level === 'warn');
  return { issues, blockers, warnings, allowed: !EDIT_GUARD_ENFORCE || blockers.length === 0 };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `${round2(n).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} грн`;
