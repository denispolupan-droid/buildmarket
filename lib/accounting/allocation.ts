// Рознесення оплати постачальнику по конкретних боргах.
//
// Гроші, тож логіка чиста й покрита тестами: жодних запитів до бази, лише
// «ось відкриті борги і сума — ось що чим закривається». Копійки рахуємо
// цілими копійками, бо на числах із плаваючою крапкою сума трьох рознесень
// не сходилась із самою оплатою (0.1 + 0.2 !== 0.3), і в балансі лишався
// хвіст у копійку, який ніхто не міг пояснити.

export type OpenCharge = {
  /** money_entries.id проводки боргу */
  id: string;
  /** Дата документа — за нею впорядковуємо «найстаріші/найновіші» */
  date: string;
  /** Скільки ще не закрито, у гривнях (> 0) */
  remaining: number;
};

export type AllocationPlan = {
  /** Що і на скільки закриваємо */
  lines: { chargeId: string; amount: number }[];
  /** Скільки з оплати не лягло на борги — аванс постачальнику */
  unallocated: number;
};

export type AllocationMode = 'oldest' | 'newest' | 'manual';

const toKop = (uah: number) => Math.round(uah * 100);
const toUah = (kop: number) => kop / 100;

/**
 * Автоматичне рознесення: гасимо борги підряд, доки вистачає суми.
 * `oldest` — від найстаріших (звична поведінка: перше в черзі — найдавніше),
 * `newest` — від найновіших (буває, коли платять «за останню поставку»).
 *
 * Порядок стабільний: за однакової дати беремо за id, інакше два однакові
 * запуски давали б різне рознесення й звірка не сходилась би сама з собою.
 */
export function planAllocation(
  charges: OpenCharge[],
  paymentAmount: number,
  mode: Exclude<AllocationMode, 'manual'>,
): AllocationPlan {
  let left = toKop(paymentAmount);
  if (left <= 0) return { lines: [], unallocated: Math.max(0, paymentAmount) };

  const sorted = [...charges]
    .filter(c => toKop(c.remaining) > 0)
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
  if (mode === 'newest') sorted.reverse();

  const lines: { chargeId: string; amount: number }[] = [];
  for (const c of sorted) {
    if (left <= 0) break;
    const take = Math.min(left, toKop(c.remaining));
    if (take <= 0) continue;
    lines.push({ chargeId: c.id, amount: toUah(take) });
    left -= take;
  }
  return { lines, unallocated: toUah(left) };
}

/**
 * Ручний вибір: перевіряємо те, що людина ввела руками. Помилка тут — це
 * закритий борг, якого не платили, тож мовчазних виправлень не робимо:
 * або план коректний, або кажемо, що саме не так.
 */
export function validateManual(
  charges: OpenCharge[],
  paymentAmount: number,
  picks: { chargeId: string; amount: number }[],
): { ok: true; plan: AllocationPlan } | { ok: false; error: string } {
  const byId = new Map(charges.map(c => [c.id, c]));
  const seen = new Set<string>();
  let sum = 0;

  for (const p of picks) {
    const charge = byId.get(p.chargeId);
    if (!charge) return { ok: false, error: 'Серед боргів немає документа, на який розносять оплату' };
    if (seen.has(p.chargeId)) return { ok: false, error: 'Один документ вказано двічі' };
    seen.add(p.chargeId);

    const amt = toKop(p.amount);
    if (!Number.isFinite(p.amount) || amt <= 0) return { ok: false, error: 'Сума рознесення має бути більшою за нуль' };
    if (amt > toKop(charge.remaining)) {
      return { ok: false, error: `На документ не можна рознести більше, ніж по ньому лишилось (${charge.remaining.toFixed(2)} ₴)` };
    }
    sum += amt;
  }

  const total = toKop(paymentAmount);
  if (sum > total) return { ok: false, error: 'Рознесено більше, ніж сума оплати' };

  return {
    ok: true,
    plan: {
      lines: picks.map(p => ({ chargeId: p.chargeId, amount: toUah(toKop(p.amount)) })),
      unallocated: toUah(total - sum),
    },
  };
}
