import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase-service';
import { fetchAllRows } from '../../../../../../lib/db-paginate';
import { rozetkaFeeKind } from '../../../../../../lib/rozetka-fee-kind';
import { getSmartTariff } from '../../../../../../lib/rozetka-smart';
import { compareSmart, isSmartRow, type SecurityRow } from '../../../../../../lib/rozetka-security';
import { recordTxn } from '../../../../../../lib/accounting/money';

// Smart Rozetka за історією гарантійного платежу (xlsx розбирає браузер, сюди —
// лише рядки) проти нашого обліку. Без post — тільки порівняння; з post: true —
// проводить різницю як Smart без замовлення (кнопка з підтвердженням).

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const { rows, post } = await req.json().catch(() => ({})) as { rows?: unknown; post?: boolean };
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 20000) {
    return NextResponse.json({ error: 'Порожній або завеликий файл' }, { status: 400 });
  }
  const parsed: SecurityRow[] = rows.map(r => {
    const o = r as Partial<SecurityRow>;
    return { id: Number(o.id), ts: String(o.ts ?? ''), type: String(o.type ?? ''), debit: Number(o.debit) || 0, credit: Number(o.credit) || 0 };
  });

  const db = createServiceClient();
  const fees = await (/* TODO(types): форма рядка рукописна — колонки звужені фільтрами запиту */ fetchAllRows((f, t) =>
    db.from('money_entries').select('amount, description, doc_type, meta')
      .eq('account_type', 'marketplace_fee').eq('counterparty_id', 'rozetka')
      .order('id').range(f, t)) as unknown as Promise<({ amount: number; description: string | null; doc_type: string | null; meta: Record<string, unknown> | null })[]>);
  // «Списання без розшифровки» 30.09 і 23.10 — це теж Smart (з'ясовано 29.10.2026 саме за цим файлом)
  const ours = fees
    .filter(f => rozetkaFeeKind(f) === 'smart' || f.meta?.kind === 'rz_unitemized')
    .reduce((s, f) => s + Number(f.amount), 0);
  const tariff = (await getSmartTariff()).map(b => b.fee);
  const cmp = compareSmart(parsed, ours, tariff);
  if (!post) return NextResponse.json(cmp);

  // «Провести різницю»: Rozetka за файлом зняла Smart більше, ніж проведено в нас —
  // різниця = Smart без замовлення (як 29.10: 260 + 165 ₴). Сума — з порівняння на
  // сервері; ключ — за останньою Smart-операцією файлу, тож повторне натискання
  // нічого не дублює (а після проведення різниця вже 0).
  if (!(cmp.delta >= 0.01)) return NextResponse.json({ error: 'Проводити нічого: Rozetka за файлом зняла не більше, ніж у нас' }, { status: 409 });
  const lastId = Math.max(...parsed.filter(isSmartRow).map(r => r.id));
  const ops = cmp.unattributed.map(u => `${u.ts.slice(0, 10)} — ${u.amount} ₴, оп. ${u.id}`).join('; ');
  const txnId = await recordTxn({
    debitAccount: 'marketplace_fee', debitParty: 'rozetka', creditAccount: 'marketplace_balance', creditParty: 'rozetka',
    amount: cmp.delta, businessDate: cmp.to ?? new Date().toISOString().slice(0, 10), docType: 'commission',
    description: `Rozetka Smart — збір без замовлення ${cmp.delta} ₴ за історією гарантійного платежу${ops ? ` (${ops})` : ''}`,
    idempotencyKey: `rz-smart-unattributed:xlsx:${lastId}`, createdBy: auth.user.email ?? 'admin',
    meta: { kind: 'rz_smart_unattributed', smart: true, marketplace: 'rozetka', rozetka_security_ops: cmp.unattributed.map(u => u.id), source: 'balance_security xlsx' },
  });
  return NextResponse.json({ ...cmp, posted: { txnId, amount: cmp.delta } });
}
