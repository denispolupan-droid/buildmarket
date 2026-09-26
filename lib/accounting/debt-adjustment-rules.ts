/**
 * «Коригування боргу» — чисті правила документа (без БД), як «Корректировка
 * долга» в 1С. Проводки, перевірки залишків і вплив на замовлення описані тут,
 * щоб їх було видно в юніт-тестах, а не лише в браузері.
 *
 * Знаки рахунків — як у money.ts: customer «+» = клієнт винен нам, supplier «−» =
 * ми винні постачальнику. Дебет сторони збільшує її борг перед нами (або
 * зменшує наш борг перед нею), кредит — навпаки.
 *
 * Операції:
 *   transfer  — DR звідки / CR куди. Для «оплату із замовлення A перенести на B»
 *               звідки = A (борг A відновлюється), куди = B (борг B закривається).
 *   offset    — взаємозалік: DR supplier / CR customer (той самий контрагент чи ні —
 *               байдуже, важливі суми).
 *   write_off — forgive: DR correction / CR сторона (прощаємо борг);
 *               income:  DR сторона / CR correction (переплата стає доходом).
 *
 * Межі (щоб документ не робив дірок): з дебетової сторони можна зняти лише те,
 * що вона реально отримала (по замовленню — «received», без замовлення — її
 * аванс/переплату); на кредитову сторону по замовленню можна покласти не більше
 * відкритого боргу; на контрагента без замовлення при перенесенні — без межі
 * (лишок стає авансом), при заліку/списанні — не більше боргу.
 */

import { settlementFor, type SettlementEntry } from './order-settlement';
import { isSpecialDebtor } from './sale-party';

export type DebtAccount = 'customer' | 'supplier';
export type LegAccount = DebtAccount | 'correction';

export type DebtSide = {
  account: DebtAccount;
  /** customers.id / службовий дебітор (np:cod, mp:*) / suppliers.id як рядок */
  party: string;
  orderId?: string | null;
};

export type Leg = { account: LegAccount; party: string | null; orderId: string | null };

export type AdjustmentOp = 'transfer' | 'offset' | 'write_off';

export type AdjustmentLineInput =
  | { op: 'transfer';  from: DebtSide; to: DebtSide; amount: number; note?: string | null }
  | { op: 'offset';    customer: DebtSide; supplier: DebtSide; amount: number; note?: string | null }
  | { op: 'write_off'; side: DebtSide; kind: 'forgive' | 'income'; amount: number; note?: string | null };

/** Стан сторони: сальдо контрагента по рахунку і, якщо є замовлення, розклад по ньому. */
export type SideState = {
  /** Σ проводок рахунку по контрагенту: customer «+» = винен нам; supplier «−» = ми винні */
  balance: number;
  /** лише коли вказано замовлення */
  sale?: number;
  received?: number;
  open?: number;
};

export const OP_LABEL: Record<AdjustmentOp, string> = {
  transfer:  'Перенесення боргу',
  offset:    'Взаємозалік',
  write_off: 'Списання',
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function sideKey(s: { account: string; party: string | null; orderId?: string | null }): string {
  return `${s.account}:${s.party ?? ''}:${s.orderId ?? ''}`;
}

/** Ноги проводки для рядка. */
export function legsFor(line: AdjustmentLineInput): { debit: Leg; credit: Leg } {
  const leg = (s: DebtSide): Leg => ({ account: s.account, party: s.party, orderId: s.orderId ?? null });
  const corr: Leg = { account: 'correction', party: null, orderId: null };
  switch (line.op) {
    case 'transfer':  return { debit: leg(line.from), credit: leg(line.to) };
    case 'offset':    return { debit: leg(line.supplier), credit: leg(line.customer) };
    case 'write_off': return line.kind === 'forgive'
      ? { debit: corr, credit: leg(line.side) }
      : { debit: leg(line.side), credit: corr };
  }
}

/** Сторони рядка, для яких треба знати стан (без 'correction'). */
export function sidesOf(line: AdjustmentLineInput): DebtSide[] {
  switch (line.op) {
    case 'transfer':  return [line.from, line.to];
    case 'offset':    return [line.customer, line.supplier];
    case 'write_off': return [line.side];
  }
}

/** Стан сторони з проводок по замовленню + сальдо контрагента. */
export function sideStateFrom(balance: number, orderEntries: SettlementEntry[] | null): SideState {
  if (!orderEntries) return { balance: round2(balance) };
  const s = settlementFor(orderEntries);
  return { balance: round2(balance), sale: s.sale, received: s.received, open: s.open };
}

/**
 * Скільки можна зняти з дебетової сторони (її борг зросте / наш борг перед нею
 * зменшиться). По замовленню — отримане; без замовлення — аванс/переплата
 * (від'ємне сальдо клієнта) або наш борг постачальнику (від'ємне сальдо).
 */
export function debitCapacity(side: DebtSide, state: SideState): number {
  if (side.orderId) return Math.max(0, state.received ?? 0);
  return Math.max(0, -state.balance);
}

/** Скільки можна покласти на кредитову сторону (її борг зменшиться). */
export function creditCapacity(side: DebtSide, state: SideState, op: AdjustmentOp): number {
  if (side.orderId) return Math.max(0, state.open ?? 0);
  // Перенесення на контрагента без замовлення: лишок стає авансом — це законно.
  if (op === 'transfer') return Number.POSITIVE_INFINITY;
  return Math.max(0, state.balance);
}

export type ValidationCtx = {
  /** стан сторони; undefined = не завантажено (помилка) */
  stateOf: (side: DebtSide) => SideState | undefined;
  /** коротка назва сторони для тексту помилки */
  label?: (side: DebtSide) => string;
};

const fmt = (n: number) => n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** null = все гаразд, інакше текст помилки для людини. */
export function validateLine(line: AdjustmentLineInput, ctx: ValidationCtx): string | null {
  const amount = Number(line.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 'Сума має бути більшою за нуль';
  if (Math.abs(amount - round2(amount)) > 1e-9) return 'Сума — не більше двох знаків після коми';
  const name = ctx.label ?? ((s: DebtSide) => `${s.account}:${s.party}${s.orderId ? ' (замовлення)' : ''}`);

  for (const s of sidesOf(line)) {
    if (!s.party) return 'Не вибрано контрагента';
    if (s.account === 'supplier' && s.orderId) return 'Борг постачальника не ділиться по замовленнях';
    if (s.account === 'customer' && s.orderId && isSpecialDebtor(s.party) === false && !/^[0-9a-f-]{36}$/i.test(s.party)) {
      return 'Некоректний клієнт';
    }
  }

  if (line.op === 'transfer') {
    if (line.from.account !== line.to.account) return 'Перенесення можливе лише між сторонами одного типу (клієнт↔клієнт, постачальник↔постачальник); між клієнтом і постачальником — «Взаємозалік»';
    if (sideKey(line.from) === sideKey(line.to)) return 'Сторони «звідки» і «куди» збігаються';
  }
  if (line.op === 'offset') {
    if (line.customer.account !== 'customer' || line.supplier.account !== 'supplier') return 'Взаємозалік: одна сторона — клієнт, інша — постачальник';
  }

  const { debit, credit } = legsFor(line);
  const debitSide  = debit.account  !== 'correction' ? (debit  as unknown as DebtSide) : null;
  const creditSide = credit.account !== 'correction' ? (credit as unknown as DebtSide) : null;

  if (debitSide) {
    const st = ctx.stateOf(debitSide);
    if (!st) return `Не вдалося завантажити стан сторони ${name(debitSide)}`;
    const cap = debitCapacity(debitSide, st);
    if (amount > cap + 0.005) {
      return debitSide.orderId
        ? `${name(debitSide)}: отримано лише ${fmt(cap)} ₴ — більше зняти не можна`
        : debitSide.account === 'supplier'
          ? `${name(debitSide)}: ми винні лише ${fmt(cap)} ₴`
          : `${name(debitSide)}: аванс/переплата лише ${fmt(cap)} ₴`;
    }
  }
  if (creditSide) {
    const st = ctx.stateOf(creditSide);
    if (!st) return `Не вдалося завантажити стан сторони ${name(creditSide)}`;
    const cap = creditCapacity(creditSide, st, line.op);
    if (amount > cap + 0.005) {
      return creditSide.orderId
        ? `${name(creditSide)}: відкритий борг по замовленню лише ${fmt(cap)} ₴`
        : `${name(creditSide)}: борг лише ${fmt(cap)} ₴`;
    }
  }
  return null;
}

/**
 * Вплив на шар замовлення (order_payments / amount_paid): лише для реальних
 * клієнтів (не np:cod / mp:*) і лише коли нога має order_id. Кредит замовлення =
 * «оплату зараховано» (+), дебет = «оплату знято» (−).
 */
export function orderPaymentDeltas(line: AdjustmentLineInput): { orderId: string; delta: number }[] {
  const { debit, credit } = legsFor(line);
  const out: { orderId: string; delta: number }[] = [];
  const real = (l: Leg) => l.account === 'customer' && !!l.orderId && !!l.party && !isSpecialDebtor(l.party);
  if (real(credit)) out.push({ orderId: credit.orderId!, delta:  round2(Number(line.amount)) });
  if (real(debit))  out.push({ orderId: debit.orderId!,  delta: -round2(Number(line.amount)) });
  return out;
}

/** Опис рядка для проводки і журналу. */
export function describeLine(line: AdjustmentLineInput, label: (s: DebtSide) => string): string {
  switch (line.op) {
    case 'transfer':  return `Перенесення: з ${label(line.from)} на ${label(line.to)}`;
    case 'offset':    return `Взаємозалік: ${label(line.customer)} ↔ ${label(line.supplier)}`;
    case 'write_off': return line.kind === 'forgive'
      ? `Списання боргу: ${label(line.side)}`
      : `Списання переплати в дохід: ${label(line.side)}`;
  }
}

/** Сума документа = Σ рядків. */
export function totalAmount(lines: AdjustmentLineInput[]): number {
  return round2(lines.reduce((s, l) => s + Number(l.amount), 0));
}
