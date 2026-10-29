import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase';
import { fetchAllRows } from '../../../../../../lib/db-paginate';
import { rozetkaFeeKind } from '../../../../../../lib/rozetka-fee-kind';
import { getSmartTariff } from '../../../../../../lib/rozetka-smart';
import { compareSmart, type SecurityRow } from '../../../../../../lib/rozetka-security';

// Smart Rozetka за історією гарантійного платежу (xlsx розбирає браузер, сюди —
// лише рядки) проти нашого обліку. Нічого не пишемо в БД — тільки порівняння.

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const { rows } = await req.json().catch(() => ({})) as { rows?: unknown };
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 20000) {
    return NextResponse.json({ error: 'Порожній або завеликий файл' }, { status: 400 });
  }
  const parsed: SecurityRow[] = rows.map(r => {
    const o = r as Partial<SecurityRow>;
    return { id: Number(o.id), ts: String(o.ts ?? ''), type: String(o.type ?? ''), debit: Number(o.debit) || 0, credit: Number(o.credit) || 0 };
  });

  const db = createServiceClient();
  const fees = await fetchAllRows<{ amount: number; description: string | null; doc_type: string | null; meta: Record<string, unknown> | null }>((f, t) =>
    db.from('money_entries').select('amount, description, doc_type, meta')
      .eq('account_type', 'marketplace_fee').eq('counterparty_id', 'rozetka')
      .order('id').range(f, t));
  // «Списання без розшифровки» 30.09 і 23.10 — це теж Smart (з'ясовано 29.10.2026 саме за цим файлом)
  const ours = fees
    .filter(f => rozetkaFeeKind(f) === 'smart' || f.meta?.kind === 'rz_unitemized')
    .reduce((s, f) => s + Number(f.amount), 0);
  const tariff = (await getSmartTariff()).map(b => b.fee);

  return NextResponse.json(compareSmart(parsed, ours, tariff));
}
