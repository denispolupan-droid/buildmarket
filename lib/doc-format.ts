// Форматування для первинних документів (видаткова, рахунок — сторінка, PDF,
// лист) — в одному місці, щоб усі рендерери друкували однаково і
// «по-бухгалтерськи», як 1С: «1 275,00», «20 жовтня 2026 р.», «Код ЄДРПОУ» / «РНОКПП».

const NBSP = ' ';

const MONTHS_GEN = [
  'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
];

function groupThousands(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** 1275 → «1 275,00» (нерозривний пробіл між розрядами, кома перед копійками). */
export function formatMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  const [int, frac] = Math.abs(n).toFixed(2).split('.');
  return `${sign}${groupThousands(int)},${frac}`;
}

/** 15 → «15»; 2.5 → «2,5»; 1.125 → «1,125» (до 3 знаків, без хвостових нулів). */
export function formatQty(n: number): string {
  const s = (Math.round(n * 1000) / 1000).toString();
  const [int, frac] = s.split('.');
  return frac ? `${groupThousands(int)},${frac}` : groupThousands(int);
}

/** Дата документа «2026-10-20…» → «20 жовтня 2026 р.» (за календарною датою, без зсуву поясу). */
export function formatDocDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS_GEN[Number(m[2]) - 1]} ${m[1]} р.`;
}

/** Календарна дата моменту в Києві: «2026-10-19T22:30:00Z» → «2026-10-20». */
export function kyivDate(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** «2026-10-20…» → «20.10.2026» (для призначення платежу). */
export function formatShortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** Підпис до податкового коду: 8 цифр — юр. особа (ЄДРПОУ), 10 — фіз. особа / ФОП (РНОКПП). */
export function taxIdLabel(code: string): string {
  const digits = code.replace(/\D/g, '');
  if (digits.length === 8) return 'Код ЄДРПОУ';
  if (digits.length === 10) return 'РНОКПП';
  return 'Код';
}
