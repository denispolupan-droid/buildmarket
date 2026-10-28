import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createServiceClient } from '../../../../lib/supabase';
import { requireStaffPage } from '../../../../lib/auth-guard';
import { fetchAllRows } from '../../../../lib/db-paginate';
import { SELLER } from '../../../../lib/company';
import { isSpecialDebtor } from '../../../../lib/accounting/sale-party';
import {
  accountsFor, agingBuckets, buildJournal, buildMutualStatement, counterpartyRefString, documentHref, groupAccounts, groupOf,
  openItemsByOrder, orderHref, parseCounterpartyRef, parseGroup, saldoWords, specialLabel,
  COUNTERPARTY_GROUPS, SETTLEMENT_ACCOUNT_LABEL,
  type CounterpartyGroup, type CounterpartyRef, type LedgerEntry, type OpenItem, type SettlementAccount,
} from '../../../../lib/accounting/mutual-settlements';
import { supplierCharges, type SupplierCharge } from '../../../../lib/accounting/supplier-debts';
import { supplierInTransit, type TransitItem } from '../../../../lib/accounting/supplier-transit';
import { pendingTransitDecisions } from '../../../../lib/accounting/transit';
import SupplierPayForm from './SupplierPayForm';
import PendingTransitBlock from './PendingTransitBlock';
import { ORDER_TAB_LABELS } from '../../../../lib/orders/status';
import { carrierInfo } from '../../../../lib/delivery-label';
import FinanceTabs from '../FinanceTabs';
import ActClient, { type ActRow } from '../_act/ActClient';
import CounterpartyPicker from './CounterpartyPicker';
import PeriodBar from './PeriodBar';
import JournalTable, { type JournalItem } from './JournalTable';

export const dynamic = 'force-dynamic';

type Db = ReturnType<typeof createServiceClient>;

type Counterparty = {
  name: string;
  legalName: string | null;
  taxId: string | null;
  address: string | null;
  group: CounterpartyGroup;
  /** Баланс кабінету дропшипера — для порівняння з рахунком `partner` */
  cabinetBalance: number | null;
};

const CUSTOMER_TYPE_LABEL: Record<string, string> = { dropship_partner: 'Дропшипер', wholesale: 'Оптовик', retail: 'Клієнт' };
const UUID = /^[0-9a-f-]{36}$/i;

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const dmy = (d: string) => d.slice(0, 10).split('-').reverse().join('.');

const TONE_COLOR = { pos: '#15803D', neg: '#B45309', zero: 'var(--text-muted)' } as const;

/** Хто кому винен — словами (lib: для площадок мінус — «отримано наперед»). */
function balanceWords(v: number, special = false): { text: string; color: string } {
  const w = saldoWords(v, special);
  return { text: w.text, color: TONE_COLOR[w.tone] };
}

/** Підписи під оборотами — що саме стоїть за розходом і приходом у цього типу контрагента. */
function turnoverCaptions(kind: CounterpartyRef['kind']): { debit: string; credit: string } {
  if (kind === 'supplier') return { debit: 'оплати й повернення постачальнику', credit: 'поставки товару' };
  if (kind === 'special')  return { debit: 'вручені посилки', credit: 'виплати площадки' };
  return { debit: 'відвантаження, виплати, комісії', credit: 'оплати, поповнення, наложка' };
}

function SaldoTag({ v, special = false }: { v: number; special?: boolean }) {
  const w = balanceWords(v, special);
  return (
    // Тим самим підписом, що й «поставки товару» під оборотами — лише колір каже, чий борг
    <div className="fin-money-sub" style={{ color: w.color, fontWeight: 600, whiteSpace: 'nowrap' }}>{w.text}</div>
  );
}

function chunks<T>(arr: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function qs(p: Record<string, string | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) u.set(k, v);
  return `/admin/finance/mutual?${u}`;
}

async function loadCounterparty(db: Db, ref: CounterpartyRef): Promise<Counterparty | null> {
  if (ref.kind === 'special') {
    return { name: specialLabel(ref.id), legalName: null, taxId: null, address: null, group: 'services', cabinetBalance: null };
  }
  if (ref.kind === 'supplier') {
    const { data } = await db.from('suppliers').select('name, legal_name, edrpou').eq('id', Number(ref.id)).maybeSingle();
    return data
      ? { name: data.name as string, legalName: data.legal_name as string | null, taxId: data.edrpou as string | null, address: null, group: 'suppliers', cabinetBalance: null }
      : null;
  }
  const { data } = await db.from('customers')
    .select('name, company, legal_name, tax_number, city, address, type, balance')
    .eq('id', ref.id).maybeSingle();
  if (!data) return null;
  return {
    name: (data.company as string | null)?.trim() || (data.legal_name as string | null)?.trim() || (data.name as string),
    legalName: data.legal_name as string | null,
    taxId: data.tax_number as string | null,
    address: [data.city, data.address].filter(Boolean).join(', ') || null,
    group: groupOf(ref, data.type as string | null),
    cabinetBalance: data.type === 'dropship_partner' ? Number(data.balance ?? 0) : null,
  };
}

// ── Журнал контрагентів групи ─────────────────────────────────────────────────

// Клієнт бази — усередині компонента, НЕ пропом: у dev React серіалізує пропси
// серверних компонентів для налагодження, і екземпляр класу валить клієнт
// («Object prototype may only be an Object or null») — сторінка не відкривалась.
async function Journal({ group, dateFrom, dateTo }: { group: CounterpartyGroup; dateFrom: string; dateTo: string }) {
  const db = createServiceClient();
  const accounts = groupAccounts(group);
  const belongs = (id: string) =>
    group === 'suppliers' ? /^\d+$/.test(id)
    : group === 'services' ? isSpecialDebtor(id)
    : UUID.test(id);

  // Сальдо зараз — з кешу (інваріант I3 тримає його рівним леджеру); рухи —
  // лише від початку періоду: сальдо на кінець = зараз − рухи після періоду.
  const [balRows, entries] = await Promise.all([
    fetchAllRows<{ counterparty_id: string; balance: number }>((f, t) => db.from('counterparty_balances')
      .select('counterparty_id, balance')
      .in('account_type', accounts).eq('currency', 'UAH')
      .order('counterparty_id').order('account_type').range(f, t)),
    fetchAllRows<{ counterparty_id: string; amount: number; business_date: string }>((f, t) => db.from('money_entries')
      .select('counterparty_id, amount, business_date')
      .in('account_type', accounts)
      .gte('business_date', dateFrom)
      .order('id').range(f, t)),
  ]);
  const current = new Map<string, number>();
  for (const r of balRows) if (belongs(r.counterparty_id)) current.set(r.counterparty_id, (current.get(r.counterparty_id) ?? 0) + Number(r.balance));
  let rows = buildJournal({ current, entries: entries.filter(e => belongs(e.counterparty_id)), dateFrom, dateTo });

  const names = new Map<string, { name: string; sub: string | null }>();
  if (group === 'suppliers') {
    for (const ids of chunks(rows.map(r => Number(r.counterpartyId)))) {
      const { data } = await db.from('suppliers').select('id, name').in('id', ids).limit(ids.length);
      for (const s of data ?? []) names.set(String(s.id), { name: s.name as string, sub: null });
    }
  } else if (group === 'services') {
    for (const r of rows) names.set(r.counterpartyId, { name: specialLabel(r.counterpartyId), sub: null });
  } else {
    const wantPartner = group === 'partners';
    const keep = new Set<string>();
    for (const ids of chunks(rows.map(r => r.counterpartyId))) {
      const { data } = await db.from('customers').select('id, name, company, legal_name, phone, type').in('id', ids).limit(ids.length);
      for (const c of data ?? []) {
        if ((c.type === 'dropship_partner') !== wantPartner) continue;
        keep.add(c.id as string);
        names.set(c.id as string, {
          name: (c.company as string | null)?.trim() || (c.legal_name as string | null)?.trim() || (c.name as string),
          sub: [CUSTOMER_TYPE_LABEL[c.type as string] ?? 'Клієнт', c.phone].filter(Boolean).join(' · '),
        });
      }
    }
    rows = rows.filter(r => keep.has(r.counterpartyId));
  }

  const items: JournalItem[] = rows.map(r => ({
    href: qs({ cp: counterpartyRefString(
      group === 'suppliers' ? { kind: 'supplier', id: r.counterpartyId }
      : group === 'services' ? { kind: 'special', id: r.counterpartyId }
      : { kind: 'customer', id: r.counterpartyId }), from: dateFrom, to: dateTo }),
    name: names.get(r.counterpartyId)?.name ?? r.counterpartyId,
    sub: names.get(r.counterpartyId)?.sub ?? null,
    opening: r.opening, debit: r.debit, credit: r.credit, closing: r.closing,
  }));

  const table = <JournalTable items={items} emptyText="За цей період ні сальдо, ні руху" special={group === 'services'} />;
  if (group !== 'suppliers') return table;
  // Повернені посилки, по яких треба вирішити долю товару, — над списком постачальників
  const pending = await pendingTransitDecisions();
  return <><PendingTransitBlock items={pending} />{table}</>;
}

// ── Сальдо в таблиці: сума без знака + Дт/Кт ──────────────────────────────────

/** Дт — на нашу користь (борг контрагента / до виплати нам), Кт — на його. */
function DtKt({ v }: { v: number }) {
  if (Math.abs(v) < 0.005) return <span style={{ color: 'var(--text-muted)' }}>0,00</span>;
  const dt = v > 0;
  return (
    <span style={{ color: dt ? '#15803D' : '#B45309' }}>
      {fmt(Math.abs(v))}
      <span style={{ marginLeft: '5px', fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.02em' }}>{dt ? 'Дт' : 'Кт'}</span>
    </span>
  );
}

// ── Рознесення оплат постачальнику (у рядках руху) ────────────────────────────

type AllocIndex = {
  /** Накладна → якими оплатами закрита */
  byCharge: Map<string, { paymentId: string; amount: number }[]>;
  /** Оплата → скільки й на скільки накладних рознесено */
  byPayment: Map<string, { chargeId: string; amount: number }[]>;
  /** Документ оплати (ордер) для посилання */
  paymentDoc: Map<string, { docId: string | null; number: string | null }>;
};

async function loadAllocations(db: Db, rows: { id: string; amount: number; doc_type: string | null }[]): Promise<AllocIndex> {
  const chargeIds = rows.filter(r => r.amount < 0).map(r => r.id);
  const paymentIds = rows.filter(r => r.amount > 0 && r.doc_type === 'supplier_payment').map(r => r.id);
  const byCharge = new Map<string, { paymentId: string; amount: number }[]>();
  const byPayment = new Map<string, { chargeId: string; amount: number }[]>();
  for (const ids of chunks(chargeIds, 200)) {
    const part = await fetchAllRows<{ payment_entry_id: string; charge_entry_id: string; amount: number }>((f, t) => db
      .from('supplier_payment_allocations').select('payment_entry_id, charge_entry_id, amount')
      .in('charge_entry_id', ids).order('charge_entry_id').order('payment_entry_id').range(f, t));
    for (const a of part) {
      const l = byCharge.get(a.charge_entry_id) ?? [];
      l.push({ paymentId: a.payment_entry_id, amount: Number(a.amount) });
      byCharge.set(a.charge_entry_id, l);
    }
  }
  for (const ids of chunks(paymentIds, 200)) {
    const part = await fetchAllRows<{ payment_entry_id: string; charge_entry_id: string; amount: number }>((f, t) => db
      .from('supplier_payment_allocations').select('payment_entry_id, charge_entry_id, amount')
      .in('payment_entry_id', ids).order('payment_entry_id').order('charge_entry_id').range(f, t));
    for (const a of part) {
      const l = byPayment.get(a.payment_entry_id) ?? [];
      l.push({ chargeId: a.charge_entry_id, amount: Number(a.amount) });
      byPayment.set(a.payment_entry_id, l);
    }
  }
  // Ордери оплат, що закрили накладні цього періоду (оплата могла бути й пізніше)
  const payerIds = [...new Set([...byCharge.values()].flat().map(p => p.paymentId))];
  const paymentDoc = new Map<string, { docId: string | null; number: string | null }>();
  const entryDoc = new Map<string, string | null>();
  for (const ids of chunks(payerIds)) {
    const { data } = await db.from('money_entries').select('id, doc_id').in('id', ids).limit(ids.length);
    for (const e of data ?? []) entryDoc.set(e.id as string, (e.doc_id as string) ?? null);
  }
  const docIds = [...new Set([...entryDoc.values()].filter(Boolean))] as string[];
  const docNum = new Map<string, string | null>();
  for (const ids of chunks(docIds)) {
    const { data } = await db.from('acc_documents').select('id, doc_number').in('id', ids).limit(ids.length);
    for (const d of data ?? []) docNum.set(d.id as string, (d.doc_number as string) ?? null);
  }
  for (const [id, docId] of entryDoc) paymentDoc.set(id, { docId, number: docId ? (docNum.get(docId) ?? null) : null });
  return { byCharge, byPayment, paymentDoc };
}

type AllocNote = { text: string; tone: 'ok' | 'warn' | 'muted'; links: { href: string; label: string }[] };

/** Підпис під рядком: накладна — чим оплачена; оплата — на скільки накладних рознесена. */
function allocationNote(r: { id: string; amount: number; doc_type: string | null }, a: AllocIndex): AllocNote | null {
  if (r.amount < 0) {
    const payers = a.byCharge.get(r.id) ?? [];
    const closed = payers.reduce((s, p) => s + p.amount, 0);
    const total = -r.amount;
    const links = payers.map(p => {
      const d = a.paymentDoc.get(p.paymentId);
      return d?.docId ? { href: `/admin/finance/voucher/${d.docId}`, label: d.number ?? 'оплата' } : null;
    }).filter(Boolean) as { href: string; label: string }[];
    if (closed >= total - 0.005) return { text: 'оплачено', tone: 'ok', links };
    if (closed > 0.005) return { text: `оплачено частково, лишилось ${fmt(total - closed)} ₴ —`, tone: 'warn', links };
    return { text: 'не оплачено', tone: 'warn', links: [] };
  }
  if (r.doc_type === 'supplier_payment') {
    const lines = a.byPayment.get(r.id) ?? [];
    const sum = lines.reduce((s, l) => s + l.amount, 0);
    const rest = r.amount - sum;
    const text = lines.length
      ? `рознесено на ${lines.length} накл. (${fmt(sum)} ₴)${rest > 0.005 ? ` · аванс ${fmt(rest)} ₴` : ''}`
      : 'не рознесено по накладних';
    return { text, tone: lines.length ? 'muted' : 'warn', links: [] };
  }
  return null;
}

// ── Що не закрито (постачальник) ──────────────────────────────────────────────

function SupplierOpen({ charges, transit, owed }: { charges: SupplierCharge[]; transit: TransitItem[]; owed: number }) {
  const today = new Date().toISOString().slice(0, 10);
  const open = charges.filter(c => c.remaining > 0.005);
  const openSum = Math.round(open.reduce((s, c) => s + c.remaining, 0) * 100) / 100;
  const aging = agingBuckets(open, today);
  // Різниця між неоплаченими накладними й боргом — оплати, не рознесені по накладних (аванс)
  const unallocated = Math.round((openSum - owed) * 100) / 100;
  const transitSum = Math.round(transit.reduce((s, t) => s + t.amount, 0) * 100) / 100;
  const transitPaid = Math.round(transit.reduce((s, t) => s + t.paid, 0) * 100) / 100;
  const LIMIT = 50;

  const td: React.CSSProperties = { padding: '5px 8px 5px 0', fontSize: '13px', borderBottom: '1px solid var(--border-light, var(--border))' };
  const num: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontWeight: 600 };
  const link: React.CSSProperties = { color: '#1D4ED8', textDecoration: 'none', fontWeight: 600 };
  const head = (title: string, sum: number, hint?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 0 2px', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }} title={hint}>{title}</span>
      <span style={{ fontSize: '12.5px', fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmt(sum)} ₴</span>
    </div>
  );

  return (
    <div className="act-no-print fin-card" style={{ marginBottom: '12px', padding: '10px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
        <div className="fin-card-title">Що не закрито на сьогодні</div>
        <div className="fin-hint" style={{ marginTop: 0 }}>
          неоплачені накладні {fmt(openSum)} ₴
          {Math.abs(unallocated) > 0.005 && (unallocated > 0
            ? ` · нерознесені оплати (аванс) ${fmt(unallocated)} ₴`
            : ` · не збігається з боргом ${fmt(owed)} ₴ на ${fmt(-unallocated)} ₴ — перевірте проводки`)}
          {' '}· разом до сплати {fmt(Math.max(owed, 0))} ₴
        </div>
      </div>

      {open.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '8px 0 2px', fontSize: '12px' }}>
          {([
            ['до 30 днів', aging.d0_30, 'var(--text-secondary)'],
            ['31–60', aging.d31_60, '#B45309'],
            ['61–90', aging.d61_90, '#B45309'],
            ['понад 90', aging.d90p, '#DC2626'],
          ] as const).filter(([, v]) => v > 0.005).map(([lbl, v, color]) => (
            <span key={lbl} style={{ fontWeight: 700, color, background: 'var(--bg-soft)', borderRadius: '6px', padding: '2px 8px' }}>
              {lbl}: {fmt(v)} ₴
            </span>
          ))}
          {aging.oldest && <span style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>найстаріша накладна — {dmy(aging.oldest)}</span>}
        </div>
      )}

      {open.length === 0 && transit.length === 0 ? (
        <div className="fin-hint" style={{ marginTop: '8px' }}>Усі накладні оплачені, посилок у дорозі немає.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '8px 28px', marginTop: '4px' }}>
          {open.length > 0 && (
            <div>
              {head(`Неоплачені накладні: ${open.length}`, openSum, 'залишок після рознесення оплат; найстаріші зверху')}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {open.slice(0, LIMIT).map(c => {
                    const oHref = orderHref(c.orderNumber);
                    const dHref = documentHref({ entryDocType: null, docId: c.docId, accDocType: c.docType });
                    return (
                      <tr key={c.id}>
                        <td style={{ ...td, color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>{dmy(c.date)}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          {dHref ? <Link href={dHref} target="_blank" style={link}>{c.docNumber ?? 'документ'}</Link> : (c.docNumber ?? '—')}
                        </td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          {oHref ? <Link href={oHref} target="_blank" style={link}>#{c.orderNumber}</Link> : ''}
                        </td>
                        <td style={num}>
                          {fmt(c.remaining)}
                          {c.allocated > 0.005 && <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}> із {fmt(c.total)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {open.length > LIMIT && <div className="fin-hint">…і ще {open.length - LIMIT}</div>}
            </div>
          )}
          {transit.length > 0 && (
            <div>
              {head(`В дорозі (дропшип, не вручено): ${transit.length}`, transitSum,
                'борг за ними вже проведено при відвантаженні; тут — яка частина боргу ще їде')}
              {transitPaid > 0.005 && <div className="fin-hint" style={{ marginTop: '2px' }}>з них уже оплачено {fmt(transitPaid)} ₴</div>}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {transit.slice(0, LIMIT).map(t => {
                    const oHref = orderHref(t.orderNumber);
                    return (
                      <tr key={t.docId}>
                        <td style={{ ...td, color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>{t.docDate ? dmy(t.docDate) : '—'}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          <Link href={`/admin/accounting/documents/${t.docId}`} target="_blank" style={link}>{t.docNumber ?? 'РН'}</Link>
                        </td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          {oHref ? <Link href={oHref} target="_blank" style={link}>#{t.orderNumber}</Link> : ''}
                          {t.trackingNumber && <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}> · {t.trackingNumber}</span>}
                        </td>
                        <td style={num}>
                          {fmt(t.amount)}
                          {t.paid > 0.005 && <span style={{ color: '#15803D', fontWeight: 400, fontSize: '11px' }}> оплачено {fmt(t.paid)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {transit.length > LIMIT && <div className="fin-hint">…і ще {transit.length - LIMIT}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Що не закрито (пошта й маркетплейси) ──────────────────────────────────────

type OpenOrder = { order_number: number; status: string | null; delivery_type: string | null };

function OpenItems({ items, orders, closing, dateTo }: {
  items: OpenItem[]; orders: Record<string, OpenOrder>; closing: number; dateTo: string;
}) {
  const LIMIT = 50;
  const groups = [
    { key: 'neg', title: 'Отримано наперед — посилка ще не вручена', hint: 'площадка вже переказала гроші, продаж визнаємо при врученні',
      rows: items.filter(i => i.orderId && i.net < 0) },
    { key: 'pos', title: 'Вручено — чекаємо виплату', hint: 'продаж є, гроші від площадки ще не прийшли',
      rows: items.filter(i => i.orderId && i.net > 0) },
    { key: 'none', title: 'Без прив’язки до замовлення', hint: 'виплати чи коригування, не рознесені по замовленнях',
      rows: items.filter(i => !i.orderId) },
  ].filter(g => g.rows.length > 0);
  const total = Math.round(items.reduce((s, i) => s + i.net, 0) * 100) / 100;

  const td: React.CSSProperties = { padding: '5px 8px 5px 0', fontSize: '13px', borderBottom: '1px solid var(--border-light, var(--border))' };
  const num: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontWeight: 600 };

  return (
    <div className="act-no-print fin-card" style={{ marginBottom: '12px', padding: '10px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
        <div className="fin-card-title">Що не закрито на {dmy(dateTo)}</div>
        <div className="fin-hint" style={{ marginTop: 0 }}>
          замовлення, де продаж і гроші ще не зійшлись · разом {fmt(Math.abs(total))} ₴ — {balanceWords(total, true).text}
          {Math.abs(total - closing) > 0.005 && ` (не збігається з сальдо ${fmt(closing)} — перевірте проводки)`}
        </div>
      </div>
      {groups.length === 0 ? (
        <div className="fin-hint" style={{ marginTop: '8px' }}>Усі замовлення закриті.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(320px, 1fr))`, gap: '8px 28px', marginTop: '6px' }}>
          {groups.map(g => {
            const sum = g.rows.reduce((s, i) => s + i.net, 0);
            return (
              <div key={g.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 0 2px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }} title={g.hint}>{g.title}</span>
                  <span style={{ fontSize: '12.5px', fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmt(Math.abs(sum))} ₴</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {g.rows.slice(0, LIMIT).map(i => {
                      const o = i.orderId ? orders[i.orderId] : undefined;
                      const href = orderHref(o?.order_number);
                      return (
                        <tr key={i.orderId ?? 'none'}>
                          <td style={{ ...td, whiteSpace: 'nowrap' }}>
                            {href ? <Link href={href} target="_blank" style={{ color: '#1D4ED8', textDecoration: 'none', fontWeight: 600 }}>#{o!.order_number}</Link> : '—'}
                          </td>
                          <td style={{ ...td, color: 'var(--text-secondary)', fontSize: '12.5px' }}>
                            {o ? [ORDER_TAB_LABELS[o.status ?? ''] ?? o.status, carrierInfo(o.delivery_type).name].filter(Boolean).join(' · ') : ''}
                          </td>
                          <td style={{ ...td, color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>{dmy(i.lastDate)}</td>
                          <td style={num}>{fmt(Math.abs(i.net))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {g.rows.length > LIMIT && <div className="fin-hint">…і ще {g.rows.length - LIMIT}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Рух по контрагенту ────────────────────────────────────────────────────────

async function Statement({ cpRef: ref, counterparty, dateFrom, dateTo, showInternal, view }: {
  cpRef: CounterpartyRef; counterparty: Counterparty; dateFrom: string; dateTo: string; showInternal: boolean; view: 'moves' | 'act';
}) {
  const db = createServiceClient();
  const accounts = accountsFor(ref);
  // Усе з пагінацією й ORDER BY id: PostgREST мовчки обрізає на 1000 рядків,
  // і сальдо на початок тихо «пливе» (інциденти 30.08 і 29.09).
  const [openingRows, entries] = await Promise.all([
    fetchAllRows<{ account_type: SettlementAccount; amount: number }>((f, t) => db.from('money_entries')
      .select('account_type, amount')
      .in('account_type', accounts)
      .eq('counterparty_id', ref.id)
      .lt('business_date', dateFrom)
      .order('id').range(f, t)),
    fetchAllRows<LedgerEntry>((f, t) => db.from('money_entries')
      .select('id, txn_id, account_type, amount, doc_type, business_date, created_at, description, doc_id, order_id, reversal_of:meta->>reversal_of')
      .in('account_type', accounts)
      .eq('counterparty_id', ref.id)
      .gte('business_date', dateFrom)
      .lte('business_date', dateTo)
      .order('id').range(f, t)),
  ]);

  const opening: Partial<Record<SettlementAccount, number>> = {};
  for (const r of openingRows) opening[r.account_type] = (opening[r.account_type] ?? 0) + Number(r.amount);
  const st = buildMutualStatement({ accounts, opening, entries, showInternal });
  const special = ref.kind === 'special';
  const captions = turnoverCaptions(ref.kind);

  // «Що не закрито» — для пошти й маркетплейсів: по яких замовленнях гроші й
  // продаж ще не зійшлись на кінець періоду. Уся історія до дати, бо замовлення
  // могло відкритись задовго до початку періоду.
  let openBlock: React.ReactNode = null;
  if (special && view === 'moves') {
    const all = await fetchAllRows<{ order_id: string | null; amount: number; business_date: string }>((f, t) => db.from('money_entries')
      .select('order_id, amount, business_date')
      .in('account_type', accounts)
      .eq('counterparty_id', ref.id)
      .lte('business_date', dateTo)
      .order('id').range(f, t));
    const items = openItemsByOrder(all);
    const ids = items.map(i => i.orderId).filter(Boolean) as string[];
    const parts = await Promise.all(chunks(ids).map(c => db.from('orders')
      .select('id, order_number, status, delivery_type').in('id', c).limit(c.length)));
    // Звичайний об'єкт, не Map: пропси серверних компонентів у dev серіалізуються в браузер
    const om: Record<string, OpenOrder> = Object.fromEntries(parts.flatMap(p => p.data ?? []).map(o => [o.id as string, o as OpenOrder]));
    openBlock = <OpenItems items={items} orders={om} closing={st.closing} dateTo={dateTo} />;
  }

  // Постачальник: поточний борг (для суми «Оплатити»), неоплачені накладні зі
  // строками й посилки в дорозі — те, що раніше показувала «Кредиторка».
  let supplierOwed = 0;
  if (ref.kind === 'supplier') {
    const { data: bal } = await db.from('counterparty_balances').select('balance')
      .eq('account_type', 'supplier').eq('counterparty_id', ref.id).eq('currency', 'UAH').maybeSingle();
    supplierOwed = Math.round(-Number(bal?.balance ?? 0) * 100) / 100;
    if (view === 'moves') {
      const [charges, transit] = await Promise.all([supplierCharges(Number(ref.id)), supplierInTransit(Number(ref.id))]);
      openBlock = <SupplierOpen charges={charges} transit={transit} owed={supplierOwed} />;
    }
  }

  // Номери документів і замовлень — щоб кожен рядок вів на свою угоду
  const docIds = [...new Set(st.rows.map(r => r.doc_id).filter(Boolean))] as string[];
  const ordIds = [...new Set(st.rows.map(r => r.order_id).filter(Boolean))] as string[];
  const [docParts, ordParts] = await Promise.all([
    Promise.all(chunks(docIds).map(ids => db.from('acc_documents').select('id, doc_number, doc_type').in('id', ids).limit(ids.length))),
    Promise.all(chunks(ordIds).map(ids => db.from('orders').select('id, order_number').in('id', ids).limit(ids.length))),
  ]);
  const docMap = new Map(docParts.flatMap(p => p.data ?? []).map(d => [d.id as string, { number: d.doc_number as string | null, type: d.doc_type as string }]));
  const ordMap = new Map(ordParts.flatMap(p => p.data ?? []).map(o => [o.id as string, o.order_number as number]));

  // Сальдо після кожного рядка — наростаючим підсумком від сальдо на початок
  const runningAfter: number[] = [];
  for (const r of st.rows) {
    const prev = runningAfter.length ? runningAfter[runningAfter.length - 1] : st.opening;
    runningAfter.push(Math.round((prev + r.amount) * 100) / 100);
  }
  const alloc = ref.kind === 'supplier' ? await loadAllocations(db, st.rows) : null;
  const lines = st.rows.map((r, i) => {
    const doc = r.doc_id ? docMap.get(r.doc_id) : undefined;
    const orderNumber = r.order_id ? (ordMap.get(r.order_id) ?? null) : null;
    return {
      ...r, doc, orderNumber, running: runningAfter[i],
      allocNote: alloc ? allocationNote(r, alloc) : null,
      docHref: documentHref({ entryDocType: r.doc_type, docId: r.doc_id, accDocType: doc?.type ?? null, orderNumber }),
    };
  });

  const cpStr = counterpartyRefString(ref);
  const base = { cp: cpStr, from: dateFrom, to: dateTo, internal: showInternal ? '1' : null };
  // Рахунки без руху й сальдо не показуємо: у звичайного покупця «Баланс партнера» — вічний нуль
  const shownAccounts = st.accounts.filter(a => Math.abs(a.opening) > 0.005 || a.debit > 0.005 || a.credit > 0.005);
  const multi = shownAccounts.length > 1;
  const totalWords = balanceWords(st.closing, special);
  const totalDebit  = lines.reduce((s, l) => s + (l.amount > 0 ? l.amount : 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.amount < 0 ? -l.amount : 0), 0);

  const th: React.CSSProperties = { padding: '10px 10px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: '13px', verticalAlign: 'top', borderBottom: '1px solid var(--border-light, var(--border))' };
  const num: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  const sumRow: React.CSSProperties = { ...td, fontWeight: 700, background: 'var(--bg-soft)' };
  const link: React.CSSProperties = { color: '#1D4ED8', textDecoration: 'none', fontWeight: 600 };

  return (
    <>
      <div className="act-no-print" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <Link href={qs({ group: counterparty.group, from: dateFrom, to: dateTo })}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '13px' }}>
          <ArrowLeft size={15} /> {COUNTERPARTY_GROUPS.find(g => g.key === counterparty.group)?.label}
        </Link>
        <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>{counterparty.name}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {[counterparty.legalName !== counterparty.name ? counterparty.legalName : null, counterparty.taxId, counterparty.address].filter(Boolean).join(' · ') || `${dmy(dateFrom)} — ${dmy(dateTo)}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <Link href={qs({ ...base, view: null })} className={'fin-pill' + (view === 'moves' ? ' active' : '')}>Рух документів</Link>
          <Link href={qs({ ...base, view: 'act' })} className={'fin-pill' + (view === 'act' ? ' active' : '')}>Акт звірки</Link>
        </div>
        {ref.kind === 'supplier' && <SupplierPayForm supplierId={Number(ref.id)} owed={supplierOwed} />}
      </div>

      {/* Підсумок як у банківській виписці: сальдо — сума без знака + хто кому винен,
          обороти — тими самими рядками, що в таблиці й акті (без схованих заліків) */}
      <div className="act-no-print fin-card mutual-sum" style={{ marginBottom: '12px', padding: '10px 18px' }}>
        <div className="fin-money-grid" style={{ marginTop: 0 }}>
          <div>
            <div className="fin-kpi-label">Сальдо на {dmy(dateFrom)}</div>
            <div className="fin-money-val">{fmt(Math.abs(st.opening))} ₴</div>
            <SaldoTag v={st.opening} special={special} />
          </div>
          <div>
            <div className="fin-kpi-label">Розхід за період</div>
            <div className="fin-money-val">{fmt(totalDebit)} ₴</div>
            <div className="fin-money-sub">{captions.debit}</div>
          </div>
          <div>
            <div className="fin-kpi-label">Прихід за період</div>
            <div className="fin-money-val">{fmt(totalCredit)} ₴</div>
            <div className="fin-money-sub">{captions.credit}</div>
          </div>
          <div>
            <div className="fin-kpi-label">Сальдо на {dmy(dateTo)}</div>
            <div className="fin-money-val" style={{ fontSize: '24px' }}>{fmt(Math.abs(st.closing))} ₴</div>
            <SaldoTag v={st.closing} special={special} />
          </div>
        </div>
        {/* Щільніше за стандартну fin-картку: це шапка виписки, а не дашборд */}
        <style>{`
          .mutual-sum .fin-money-val { margin-top: 2px; }
          .mutual-sum .fin-money-sub { margin-top: 1px; }
          .mutual-sum .fin-table { margin-top: 8px !important; }
          .mutual-sum .fin-table td { padding: 5px 8px 5px 0; }
        `}</style>

        {multi && (
          <table className="fin-table" style={{ marginTop: '16px', borderTop: '1px solid var(--border)' }}>
            <tbody>
              {shownAccounts.map(a => (
                <tr key={a.account}>
                  <td className="muted">{SETTLEMENT_ACCOUNT_LABEL[a.account]}</td>
                  <td className="num muted">на {dmy(dateFrom)}: {fmt(Math.abs(a.opening))} ₴</td>
                  <td className="num">на {dmy(dateTo)}: {fmt(Math.abs(a.closing))} ₴</td>
                  <td style={{ width: '1%' }}><SaldoTag v={a.closing} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {counterparty.cabinetBalance != null && (
          <div className="fin-hint" style={{ marginTop: '12px' }}>
            Баланс у кабінеті партнера зараз — {fmt(counterparty.cabinetBalance)} ₴. Від обліку може відрізнятись на суму замовлень у дорозі:
            кабінет списує їх при оформленні, облік — при врученні.
          </div>
        )}
      </div>

      {openBlock}

      {(st.hiddenInternal > 0 || showInternal) && (
        <div className="act-no-print fin-hint" style={{ margin: '0 0 10px', fontSize: '12px' }}>
          {showInternal
            ? 'Показано внутрішні заліки між рахунками контрагента і сторновані проводки. '
            : `Сховано рядків: ${st.hiddenInternal} — внутрішні заліки авансу партнера і проводки разом з їх сторно (у сумі нуль, на сальдо не впливають). `}
          <Link href={qs({ ...base, internal: showInternal ? null : '1', view: view === 'act' ? 'act' : null })} className="fin-hint-toggle">
            {showInternal ? 'Сховати' : 'Показати'}
          </Link>
        </div>
      )}

      {view === 'act' ? (
        <ActClient
          counterpartyName={counterparty.name}
          counterpartyLegalName={counterparty.legalName}
          counterpartyTaxId={counterparty.taxId}
          counterpartyAddress={counterparty.address}
          dateFrom={dateFrom}
          dateTo={dateTo}
          opening={st.opening}
          rows={lines.map<ActRow>(l => {
            const refs = [l.doc?.number, l.orderNumber != null ? `#${l.orderNumber}` : null].filter(Boolean).join(', ');
            return {
              date: l.business_date,
              docText: `${l.label}${refs ? ` (${refs})` : ''}`,
              description: [multi ? SETTLEMENT_ACCOUNT_LABEL[l.account_type] : null, l.description].filter(Boolean).join(' — '),
              debit: l.amount > 0 ? l.amount : 0,
              credit: l.amount < 0 ? -l.amount : 0,
              docHref: l.docHref,
              orderNumber: l.orderNumber,
            };
          })}
          ourName={SELLER.name}
          ourSigner={SELLER.signatory || SELLER.name.replace(/^ФОП\s+/, '')}
          mode={ref.kind === 'supplier' ? 'supplier' : 'customer'}
        />
      ) : (
        <div className="fin-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
            <b>Розхід</b> — що ми віддали контрагенту (товар, гроші), <b>прихід</b> — що отримали від нього.
            {special
              ? ' Сальдо: Дт — до виплати нам, Кт — отримано наперед. '
              : ' Сальдо: Дт — борг контрагента, Кт — наш борг. '}
            Клік по документу чи замовленню відкриває угоду.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
              <thead>
                <tr>
                  <th style={th}>Дата</th>
                  <th style={th}>Документ</th>
                  <th style={th}>Замовлення</th>
                  <th style={th}>Зміст</th>
                  <th style={{ ...th, textAlign: 'right' }}>Розхід</th>
                  <th style={{ ...th, textAlign: 'right' }}>Прихід</th>
                  <th style={{ ...th, textAlign: 'right' }}>Сальдо</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6} style={sumRow}>Сальдо на {dmy(dateFrom)}</td>
                  <td style={{ ...num, ...sumRow }}><DtKt v={st.opening} /></td>
                </tr>
                {lines.length === 0 && (
                  <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '28px' }}>Руху за період немає</td></tr>
                )}
                {lines.map(l => {
                  const running = l.running;
                  const docLabel = l.doc?.number ? `${l.label} ${l.doc.number}` : l.label;
                  const oHref = orderHref(l.orderNumber);
                  return (
                    <tr key={l.id} className="mutual-row">
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{dmy(l.business_date)}</td>
                      <td style={td}>
                        {l.docHref && l.doc
                          ? <Link href={l.docHref} target="_blank" style={link}>{docLabel}</Link>
                          : <span style={{ fontWeight: 600 }}>{docLabel}</span>}
                        {multi && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{SETTLEMENT_ACCOUNT_LABEL[l.account_type]}</div>
                        )}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        {oHref ? <Link href={oHref} target="_blank" style={link}>#{l.orderNumber}</Link> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ ...td, color: 'var(--text-secondary)', fontSize: '12.5px' }}>
                        {l.description ?? ''}
                        {l.allocNote && (
                          <div style={{ marginTop: '2px', fontSize: '11.5px', color: l.allocNote.tone === 'ok' ? '#15803D' : l.allocNote.tone === 'warn' ? '#B45309' : 'var(--text-muted)' }}>
                            {l.allocNote.text}
                            {l.allocNote.links.map((p, k) => (
                              <span key={k}>{k ? ', ' : ' '}<Link href={p.href} target="_blank" style={{ ...link, fontWeight: 600 }}>{p.label}</Link></span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={num}>{l.amount > 0 ? fmt(l.amount) : ''}</td>
                      <td style={num}>{l.amount < 0 ? fmt(-l.amount) : ''}</td>
                      <td style={{ ...num, fontWeight: 600 }}><DtKt v={running} /></td>
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={4} style={sumRow}>Обороти за період</td>
                  <td style={{ ...num, ...sumRow }}>{fmt(totalDebit)}</td>
                  <td style={{ ...num, ...sumRow }}>{fmt(totalCredit)}</td>
                  <td style={sumRow} />
                </tr>
                <tr>
                  <td colSpan={6} style={{ ...sumRow, borderBottom: 'none' }}>Сальдо на {dmy(dateTo)} — {totalWords.text}</td>
                  <td style={{ ...num, ...sumRow, borderBottom: 'none' }}><DtKt v={st.closing} /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <style>{`.mutual-row:hover td { background: var(--bg-soft); }`}</style>
        </div>
      )}
    </>
  );
}

// ── Сторінка ──────────────────────────────────────────────────────────────────

export default async function MutualSettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ cp?: string; group?: string; from?: string; to?: string; internal?: string; view?: string }>;
}) {
  await requireStaffPage('admin');
  const sp = await searchParams;
  const db = createServiceClient();

  const today      = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const dateFrom = isDate(sp.from) ? sp.from! : monthStart;
  const dateTo   = isDate(sp.to)   ? sp.to!   : today;

  const ref = parseCounterpartyRef(sp.cp);
  const counterparty = ref ? await loadCounterparty(db, ref) : null;
  const group: CounterpartyGroup = counterparty?.group ?? parseGroup(sp.group) ?? 'customers';

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1300px' }}>
      <div className="act-no-print">
        <div style={{ marginBottom: '14px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Взаєморозрахунки</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Розрахунки з покупцями, партнерами й постачальниками за період — рух документів і акт звірки
          </p>
        </div>
        <FinanceTabs />

        <div className="fin-card" style={{ margin: '16px 0 10px', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {COUNTERPARTY_GROUPS.map(g => (
              <Link key={g.key} href={qs({ group: g.key, from: dateFrom, to: dateTo })}
                className={'fin-pill' + (g.key === group ? ' active' : '')}>
                {g.label}
              </Link>
            ))}
          </div>
          <PeriodBar dateFrom={dateFrom} dateTo={dateTo} />
        </div>
        <div style={{ marginBottom: '16px' }}>
          <CounterpartyPicker
            value={ref && counterparty ? { ref: counterpartyRefString(ref), label: counterparty.name } : null}
            dateFrom={dateFrom}
            dateTo={dateTo}
          />
        </div>
      </div>

      {ref && counterparty
        ? <Statement cpRef={ref} counterparty={counterparty} dateFrom={dateFrom} dateTo={dateTo}
            showInternal={sp.internal === '1'} view={sp.view === 'act' ? 'act' : 'moves'} />
        : sp.cp
          ? <div className="fin-card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>Контрагента не знайдено</div>
          : <Journal group={group} dateFrom={dateFrom} dateTo={dateTo} />}
    </div>
  );
}

