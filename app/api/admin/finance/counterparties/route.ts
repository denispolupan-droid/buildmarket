import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';
import { SPECIAL_DEBTOR_LABEL } from '../../../../../lib/accounting/sale-party';
import { escapeOrTerm, personSearchOr } from '../../../../../lib/pg-filter';

export type CounterpartyOption = {
  /** Посилання для URL «Взаєморозрахунків»: c:<id> / s:<id> (lib/accounting/mutual-settlements) */
  ref: string;
  label: string;
  /** Тип і контакти: «Дропшипер · 0671234567» */
  sub: string | null;
  /** Сальдо по всіх рахунках розрахунків: плюс — нам винні, мінус — винні ми */
  balance: number;
};

const TYPE_LABEL: Record<string, string> = {
  dropship_partner: 'Дропшипер',
  wholesale:        'Оптовик',
  retail:           'Клієнт',
};

type CustomerRow = { id: string; name: string; company: string | null; legal_name: string | null; phone: string | null; type: string | null };
const customerLabel = (c: CustomerRow) => c.company?.trim() || c.legal_name?.trim() || c.name;

// Пошук контрагента для «Взаєморозрахунків»: клієнти/партнери, постачальники,
// службові дебітори. Без запиту — усі з ненульовим сальдо, найбільші зверху.
// Сальдо — з кешу counterparty_balances (інваріант I3 тримає його рівним леджеру).
export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const db = createServiceClient();

  const { data: balRows, error: balErr } = await db.from('counterparty_balances')
    .select('counterparty_id, account_type, balance')
    .in('account_type', ['customer', 'partner', 'supplier'])
    .eq('currency', 'UAH')
    .order('counterparty_id').order('account_type')
    .limit(5000);
  if (balErr) return NextResponse.json({ error: balErr.message }, { status: 500 });

  // id постачальників (числа) і клієнтів (uuid) не перетинаються, але ключ з
  // типом рахунку робить це явним
  const supplierBal = new Map<string, number>();
  const customerBal = new Map<string, number>();
  for (const r of balRows ?? []) {
    const m = r.account_type === 'supplier' ? supplierBal : customerBal;
    m.set(r.counterparty_id as string, (m.get(r.counterparty_id as string) ?? 0) + Number(r.balance));
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const specials: CounterpartyOption[] = Object.entries(SPECIAL_DEBTOR_LABEL)
    .filter(([id, label]) => !q || label.toLowerCase().includes(q.toLowerCase()) || id.includes(q.toLowerCase()))
    .map(([id, label]) => ({ ref: `c:${id}`, label, sub: 'Службовий дебітор', balance: round2(customerBal.get(id) ?? 0) }));

  let customers: CustomerRow[] = [];
  let suppliers: { id: number; name: string }[] = [];

  if (q.length >= 2) {
    const ors = personSearchOr(q);
    const term = escapeOrTerm(q);
    const [c, s] = await Promise.all([
      ors
        ? db.from('customers').select('id, name, company, legal_name, phone, type').or(ors)
            .order('last_order_at', { ascending: false, nullsFirst: false }).order('id').limit(25)
        : Promise.resolve({ data: [] as CustomerRow[] }),
      term
        ? db.from('suppliers').select('id, name').ilike('name', `%${term}%`).order('name').limit(10)
        : Promise.resolve({ data: [] as { id: number; name: string }[] }),
    ]);
    customers = (c.data ?? []) as CustomerRow[];
    suppliers = (s.data ?? []) as { id: number; name: string }[];
  } else if (!q) {
    // Без запиту — ті, з ким є що звіряти
    // Найбільші 100: список id іде в URL запиту, а довгий URL PostgREST не прийме
    const custIds = [...customerBal]
      .filter(([id, b]) => Math.abs(b) > 0.01 && /^[0-9a-f-]{36}$/i.test(id))
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 100)
      .map(([id]) => id);
    const supIds = [...supplierBal].filter(([, b]) => Math.abs(b) > 0.01).map(([id]) => Number(id)).filter(Number.isFinite);
    const [c, s] = await Promise.all([
      custIds.length
        ? db.from('customers').select('id, name, company, legal_name, phone, type').in('id', custIds).limit(100)
        : Promise.resolve({ data: [] as CustomerRow[] }),
      supIds.length
        ? db.from('suppliers').select('id, name').in('id', supIds).limit(200)
        : Promise.resolve({ data: [] as { id: number; name: string }[] }),
    ]);
    customers = (c.data ?? []) as CustomerRow[];
    suppliers = (s.data ?? []) as { id: number; name: string }[];
  }

  const options: CounterpartyOption[] = [
    ...suppliers.map(s => ({ ref: `s:${s.id}`, label: s.name, sub: 'Постачальник', balance: round2(supplierBal.get(String(s.id)) ?? 0) })),
    ...customers.map(c => ({
      ref: `c:${c.id}`,
      label: customerLabel(c),
      sub: [TYPE_LABEL[c.type ?? ''] ?? 'Клієнт', c.phone].filter(Boolean).join(' · '),
      balance: round2(customerBal.get(c.id) ?? 0),
    })),
  ];
  // Без запиту — за розміром сальдо; з запитом — порядок пошуку (постачальники, потім клієнти)
  if (!q) options.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  const withSpecials = q ? [...specials, ...options] : [...options, ...specials.filter(s => Math.abs(s.balance) > 0.01)];
  return NextResponse.json({ options: withSpecials.slice(0, 60) });
}
