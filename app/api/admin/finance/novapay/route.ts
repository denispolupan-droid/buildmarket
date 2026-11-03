import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase-service';
import { ingestNovapayStatement, postNpPayouts } from '../../../../../lib/novapay-ingest';
import { postNovapayAutoTopups } from '../../../../../lib/novapay-autopost';
import { postNovapayRow, NovapayPostError } from '../../../../../lib/novapay-post';
import { withApi } from '../../../../../lib/api-handler';

// Виписка NovaPay: список документів і категоризація списань людиною.
// Саме проведення — lib/novapay-post (спільне з виправленнями агента звірки).

async function _GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const db = createServiceClient();
  const status = req.nextUrl.searchParams.get('status');
  let q = db.from('novapay_txns')
    .select('id, txn_date, amount, direction, counterparty, purpose, register_no, kind, status, category, note, posted_at')
    .order('txn_date', { ascending: false }).order('id', { ascending: false }).limit(500);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export const GET = withApi('admin/finance/novapay', _GET);

async function _POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const db = createServiceClient();
  const body = await req.json().catch(() => ({})) as { action?: string; id?: string; category?: string; description?: string; note?: string; supplierId?: string };
  const by = auth.user.email ?? 'admin';

  // Ручне оновлення виписки (крон робить це раз на день)
  if (body.action === 'refresh') {
    try {
      const ingest = await ingestNovapayStatement(14);
      const payouts = await postNpPayouts(by);
      const autopost = await postNovapayAutoTopups(`autopost:${by}`);
      return NextResponse.json({ ok: true, ingest, payouts, autopost });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  if (!body.id) return NextResponse.json({ error: 'Немає id' }, { status: 400 });
  const { data: row } = await db.from('novapay_txns').select('*').eq('id', body.id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Документ не знайдено' }, { status: 404 });
  if (row.status === 'posted') return NextResponse.json({ error: 'Уже проведено' }, { status: 400 });

  if (body.category === 'ignore') {
    await db.from('novapay_txns').update({ status: 'ignored', category: 'ignore', note: body.note ?? null, posted_at: new Date().toISOString(), posted_by: by }).eq('id', row.id);
    return NextResponse.json({ ok: true });
  }

  try {
    const txnId = await postNovapayRow(row, { category: body.category ?? '', supplierId: body.supplierId ?? null, description: body.description, note: body.note, by });
    return NextResponse.json({ ok: true, txnId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: err instanceof NovapayPostError ? 400 : 500 });
  }
}

export const POST = withApi('admin/finance/novapay', _POST);
