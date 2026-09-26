/**
 * «Коригування боргу» — чисті правила документа (без БД), як «Корректировка
 * долга» в 1С. Проводки, перевірки залишків і вплив на замовлення описані тут,
 * щоб їх було видно в юніт-тестах, а не лише в браузері.
 *
 * Знаки рахунків — як у money.ts: customer «+» = клієнт винен нам, supplier «−» =
 * ми винні постачальнику, partner «−» = ми винні дропшип-партнеру (його аванс).
 * Дебет сторони збільшує її борг перед нами (або зменшує наш борг перед нею),
 * кредит — навпаки.
 *
 * Операції:
 *   transfer  — DR звідки / CR куди. Для «оплату із замовлення A перенести на B»
 *               звідки = A (борг A відновлюється), куди = B (борг B закривається).
 *               Клієнт ↔ партнер теж дозволено: балансом партнера закрити
 *               замовлення клієнта, або переплату клієнта покласти партнеру на баланс.
 *   offset    — взаємозалік: DR supplier / CR customer (той самий контрагент чи ні —
 *               байдуже, важливі суми).
 *   write_off — forgive: DR bad_debt / CR сторона (прощаємо борг; партнеру — компенсація);
 *               income:  DR сторона / CR correction (переплата / баланс стає доходом).
 *
 * Межі (щоб документ не робив дірок): з дебетової сторони можна зняти лише те,
 * що вона реально отримала (по замовленню — «received», без замовлення — її
 * аванс/переплату; партнер — його кабінетний баланс); на кредитову сторону по
 * замовленню можна покласти не більше відкритого боргу; на контрагента без
 * замовлення при перенесенні — без межі (лишок стає авансом), при заліку/списанні —
 * не більше боргу; партнеру в кредит (компенсація) — без межі.
 *
 * Партнер: сторона без замовлень (дропшип-борг живе в його балансі). Кожна нога
 * 'partner' окрім проводки править і кабінетний баланс (partnerBalanceDeltas).
 */

import { settlementFor, type SettlementEntry } from './order-settlement';
import { isSpecialDebtor } from './sale-party';

export type DebtAccount = 'customer' | 'supplier' | 'partner';
/** Рахунки-«кошики» без контрагента: correction — дохід поза P&L, bad_debt — витрата. */
export type BucketAccount = 'correction' | 'bad_debt';
export type LegAccount = DebtAccount | BucketAccount;

export const DEBT_ACCOUNTS: readonly DebtAccount[] = ['customer', 'supplier', 'partner'] as const;
export function isDebtAccount(a: string): a is DebtAccount {
  return (DEBT_ACCOUNTS as readonly string[]).includes(a);
}

export type DebtSide = {
  account: DebtAccount;
  /** customers.id / службовий дебітор (np:cod, mp:*) / suppliers.id як рядок; partner — customers.id дропшипера */
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
  /** Σ проводок рахунку по контрагенту: customer «+» = винен нам; supplier/partner «−» = ми винні */
  balance: number;
  /** лише коли вказано замовлення */
  sale?: number;
  received?: number;
  open?: number;
  /** лише партнер: баланс кабінету (customers.balance) — те, що він реально може витратити */
  cabinet?: number;
};

export const OP_LABEL: Record<AdjustmentOp, string> = {
  transfer:  'Перенесення боргу',
  offset:    'Взаємозалік',
  write_off: 'Списання',
};

export const ACCOUNT_LABEL: Record<LegAccount, string> = {
  customer:   'Клієнт',
  supplier:   'Постачальник',
  partner:    'Партнер (дропшип)',
  correction: 'Коригування (дохід)',
  bad_debt:   'Списання боргів / компенсації',
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function sideKey(s: { account: string; party: string | null; orderId?: string | null }): string {
  return `${s.account}:${s.party ?? ''}:${s.orderId ?? ''}`;
}

/** Ноги проводки для рядка. */
export function legsFor(line: AdjustmentLineInput): { debit: Leg; credit: Leg } {
  const leg = (s: DebtSide): Leg => ({ account: s.account, party: s.party, orderId: s.orderId ?? null });
  const bucket = (account: BucketAccount): Leg => ({ account, party: null, orderId: null });
  switch (line.op) {
    case 'transfer':  return { debit: leg(line.from), credit: leg(line.to) };
    case 'offset':    return { debit: leg(line.supplier), credit: leg(line.customer) };
    case 'write_off': return line.kind === 'forgive'
      ? { debit: bucket('bad_debt'), credit: leg(line.side) }
      : { debit: leg(line.side), credit: bucket('correction') };
  }
}

/** Сторони рядка, для яких треба знати стан (без кошиків). */
export function sidesOf(line: AdjustmentLineInput): DebtSide[] {
  switch (line.op) {
    case 'transfer':  return [line.from, line.to];
    case 'offset':    return [line.customer, line.supplier];
    case 'write_off': return [line.side];
  }
}

/** Стан сторони з проводок по замовленню + сальдо контрагента (+ кабінетний баланс партнера). */
export function sideStateFrom(balance: number, orderEntries: SettlementEntry[] | null, cabinet?: number): SideState {
  const base: SideState = { balance: round2(balance) };
  if (cabinet !== undefined) base.cabinet = round2(cabinet);
  if (!orderEntries) return base;
  const s = settlementFor(orderEntries);
  return { ...base, sale: s.sale, received: s.received, open: s.open };
}

/**
 * Скільки можна зняти з дебетової сторони (її борг зросте / наш борг перед нею
 * зменшиться). По замовленню — отримане; без замовлення — аванс/переплата
 * (від'ємне сальдо клієнта) або наш борг постачальнику (від'ємне сальдо);
 * партнер — кабінетний баланс (він менший за леджерний на замовлення в дорозі,
 * і саме його партнер бачить як доступний).
 */
export function debitCapacity(side: DebtSide, state: SideState): number {
  if (side.orderId) return Math.max(0, state.received ?? 0);
  if (side.account === 'partner') return Math.max(0, state.cabinet ?? 0);
  return Math.max(0, -state.balance);
}

/** Скільки можна покласти на кредитову сторону (її борг зменшиться). */
export function creditCapacity(side: DebtSide, state: SideState, op: AdjustmentOp): number {
  if (side.orderId) return Math.max(0, state.open ?? 0);
  // Перенесення на контрагента без замовлення: лишок стає авансом — це законно.
  if (op === 'transfer') return Number.POSITIVE_INFINITY;
  // Партнеру в кредит (компенсація на баланс) — рішення власника, межі немає.
  if (side.account === 'partner') return Number.POSITIVE_INFINITY;
  return Math.max(0, state.balance);
}

export type ValidationCtx = {
  /** стан сторони; undefined = не завантажено (помилка) */
  stateOf: (side: DebtSide) => SideState | undefined;
  /** коротка назва сторони для тексту помилки */
  label?: (side: DebtSide) => string;
};

const fmt = (n: number) => n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Які пари сторін можна переносити напряму (решта — взаємозалік або заборонено). */
function transferPairAllowed(a: DebtAccount, b: DebtAccount): boolean {
  if (a === b) return true;
  const pair = new Set([a, b]);
  return pair.has('customer') && pair.has('partner');
}

/** null = все гаразд, інакше текст помилки для людини. */
export function validateLine(line: AdjustmentLineInput, ctx: ValidationCtx): string | null {
  const amount = Number(line.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 'Сума має бути більшою за нуль';
  if (Math.abs(amount - round2(amount)) > 1e-9) return 'Сума — не більше двох знаків після коми';
  const name = ctx.label ?? ((s: DebtSide) => `${s.account}:${s.party}${s.orderId ? ' (замовлення)' : ''}`);

  for (const s of sidesOf(line)) {
    if (!s.party) return 'Не вибрано контрагента';
    if (s.account === 'supplier' && s.orderId) return 'Борг постачальника не ділиться по замовленнях';
    if (s.account === 'partner' && s.orderId) return 'Баланс партнера не ділиться по замовленнях — дропшип-борг живе в самому балансі';
    if (s.account === 'partner' && !/^[0-9a-f-]{36}$/i.test(s.party)) return 'Некоректний партнер';
    if (s.account === 'customer' && s.orderId && isSpecialDebtor(s.party) === false && !/^[0-9a-f-]{36}$/i.test(s.party)) {
      return 'Некоректний клієнт';
    }
  }

  if (line.op === 'transfer') {
    if (!transferPairAllowed(line.from.account, line.to.account)) {
      return 'Перенесення можливе між сторонами одного типу або клієнт↔партнер; між клієнтом і постачальником — «Взаємозалік»';
    }
    if (sideKey(line.from) === sideKey(line.to)) return 'Сторони «звідки» і «куди» збігаються';
  }
  if (line.op === 'offset') {
    if (line.customer.account !== 'customer' || line.supplier.account !== 'supplier') return 'Взаємозалік: одна сторона — клієнт, інша — постачальник';
  }

  const { debit, credit } = legsFor(line);
  const debitSide  = isDebtAccount(debit.account)  ? (debit  as unknown as DebtSide) : null;
  const creditSide = isDebtAccount(credit.account) ? (credit as unknown as DebtSide) : null;

  if (debitSide) {
    const st = ctx.stateOf(debitSide);
    if (!st) return `Не вдалося завантажити стан сторони ${name(debitSide)}`;
    const cap = debitCapacity(debitSide, st);
    if (amount > cap + 0.005) {
      return debitSide.orderId
        ? `${name(debitSide)}: отримано лише ${fmt(cap)} ₴ — більше зняти не можна`
        : debitSide.account === 'supplier'
          ? `${name(debitSide)}: ми винні лише ${fmt(cap)} ₴`
          : debitSide.account === 'partner'
            ? `${name(debitSide)}: на балансі партнера лише ${fmt(cap)} ₴`
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

/**
 * Вплив на кабінетний баланс партнера (partner_balance_transactions 'adjustment'):
 * кредит рахунку partner = ми винні більше = баланс росте (+), дебет = баланс
 * зменшується (−). Знак — як в amount самої таблиці.
 */
export function partnerBalanceDeltas(line: AdjustmentLineInput): { partner: string; delta: number }[] {
  const { debit, credit } = legsFor(line);
  const out: { partner: string; delta: number }[] = [];
  if (credit.account === 'partner' && credit.party) out.push({ partner: credit.party, delta:  round2(Number(line.amount)) });
  if (debit.account  === 'partner' && debit.party)  out.push({ partner: debit.party,  delta: -round2(Number(line.amount)) });
  return out;
}

/** Опис рядка для проводки і журналу. */
export function describeLine(line: AdjustmentLineInput, label: (s: DebtSide) => string): string {
  switch (line.op) {
    case 'transfer':  return `Перенесення: з ${label(line.from)} на ${label(line.to)}`;
    case 'offset':    return `Взаємозалік: ${label(line.customer)} ↔ ${label(line.supplier)}`;
    case 'write_off': return line.kind === 'forgive'
      ? (line.side.account === 'partner' ? `Компенсація на баланс: ${label(line.side)}` : `Списання боргу: ${label(line.side)}`)
      : (line.side.account === 'partner' ? `Списання балансу в дохід: ${label(line.side)}` : `Списання переплати в дохід: ${label(line.side)}`);
  }
}

/** Сума документа = Σ рядків. */
export function totalAmount(lines: AdjustmentLineInput[]): number {
  return round2(lines.reduce((s, l) => s + Number(l.amount), 0));
}
