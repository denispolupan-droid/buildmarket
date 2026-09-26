import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase';
import { SPECIAL_DEBTOR_LABEL } from '../../../../../../lib/accounting/sale-party';

export type PartyOption = { id: string; label: string; sub: string | null; balance: number };

// Пошук сторони для форми КБ: клієнти (з сальдо), службові дебітори (np:cod,
// mp:*), постачальники. Сальдо — з кешу counterparty_balances (інваріант I3
// гарантує рівність леджеру).
export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const account = sp.get('account');
  const q = (sp.get('q') ?? '').trim();
  if (account !== 'customer' && account !== 'supplier') {
    return NextResponse.json({ error: 'account = customer | supplier' }, { status: 400 });
  }
  const db = createServiceClient();
  const balanceOf = async (ids: string[]) => {
    if (!ids.length) return new Map<string, number>();
    const { data } = await db.from('counterparty_balances').select('counterparty_id, balance')
      .eq('account_type', account).eq('currency', 'UAH').in('counterparty_id', ids).limit(1000);
    return new Map((data ?? []).map(r => [r.counterparty_id as string, Number(r.balance)]));
  };

  if (account === 'supplier') {
    let query = db.from('suppliers').select('id, name').eq('is_active', true).order('name').limit(50);
    if (q) query = query.ilike('name', `%${q}%`);
    const { data } = await query;
    const bal = await balanceOf((data ?? []).map(s => String(s.id)));
    const options: PartyOption[] = (data ?? []).map(s => ({ id: String(s.id), label: s.name, sub: null, balance: bal.get(String(s.id)) ?? 0 }));
    return NextResponse.json({ options });
  }

  // Службові дебітори — завжди зверху, щоб їх можна було вибрати без пошуку
  const specials = Object.entries(SPECIAL_DEBTOR_LABEL)
    .filter(([id, label]) => !q || label.toLowerCase().includes(q.toLowerCase()) || id.includes(q.toLowerCase()));
  let query = db.from('customers').select('id, name, company, legal_name, phone, city')
    .order('last_order_at', { ascending: false, nullsFirst: false }).limit(30);
  if (q.length >= 2) query = query.or(`name.ilike.%${q}%,company.ilike.%${q}%,legal_name.ilike.%${q}%,phone.ilike.%${q}%`);
  const { data } = await query;
  const bal = await balanceOf([...specials.map(([id]) => id), ...(data ?? []).map(c => c.id as string)]);
  const options: PartyOption[] = [
    ...specials.map(([id, label]) => ({ id, label, sub: 'службовий дебітор', balance: bal.get(id) ?? 0 })),
    ...(data ?? []).map(c => ({
      id: c.id as string,
      label: ((c.company as string | null)?.trim() || (c.legal_name as string | null)?.trim() || c.name) as string,
      sub: [c.phone, c.city].filter(Boolean).join(' · ') || null,
      balance: bal.get(c.id as string) ?? 0,
    })),
  ];
  return NextResponse.json({ options });
}
