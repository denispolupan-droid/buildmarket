import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../lib/supabase';
import { createDocument, confirmDocument, cancelDocument, correctDocument } from '../../../../../lib/accounting/documents';
import type { CreateDocumentInput } from '../../../../../lib/accounting/types';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { action, document_id, reason, ...input } = body;

  try {
    if (action === 'confirm') {
      await confirmDocument(document_id, user.email ?? 'admin');
      return NextResponse.json({ ok: true });
    }
    if (action === 'cancel') {
      await cancelDocument(document_id, user.email ?? 'admin', reason);
      return NextResponse.json({ ok: true });
    }
    if (action === 'correct') {
      const result = await correctDocument(document_id, user.email ?? 'admin');
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === 'update_prices') {
      // lines: { sku: string; cost_price: number }[]
      // Updates base cost_price in document lines + batches, then re-applies any existing LC.
      const lines = body.lines as { sku: string; cost_price: number }[];
      if (!Array.isArray(lines) || lines.length === 0) {
        return NextResponse.json({ error: 'lines required' }, { status: 400 });
      }
      const db = createServiceClient();
      const { data: doc } = await db
        .from('acc_documents')
        .select('status, doc_type, landed_cost_method')
        .eq('id', document_id)
        .single();
      if (!doc || doc.status !== 'confirmed' || !['receipt', 'stock_in'].includes(doc.doc_type)) {
        return NextResponse.json({ error: 'Можна редагувати ціни тільки у проведеному приході' }, { status: 400 });
      }

      // 1. Set new base prices
      for (const line of lines) {
        await db.from('acc_document_lines')
          .update({ cost_price: line.cost_price })
          .eq('document_id', document_id)
          .eq('sku', line.sku);
        await db.from('stock_batches')
          .update({ cost_price: line.cost_price })
          .eq('document_id', document_id)
          .eq('sku', line.sku);
      }

      // 2. Re-apply landed costs if they were previously distributed
      const lcMethod = (doc as { landed_cost_method?: string }).landed_cost_method;
      if (lcMethod) {
        // Reset distributed flag so apply_landed_costs will process them again
        await db.from('landed_cost_lines')
          .update({ distributed: false })
          .eq('document_id', document_id);

        // Also reset landed_cost_total on document so it recalculates correctly
        await db.from('acc_documents')
          .update({ landed_cost_total: 0, total_cost: null })
          .eq('id', document_id);

        await db.rpc('apply_landed_costs', {
          p_document_id: document_id,
          p_method: lcMethod,
        });
      }

      return NextResponse.json({ ok: true });
    }

    const doc = await createDocument({ ...input as CreateDocumentInput, created_by: user.email ?? 'admin' });
    return NextResponse.json(doc);
  } catch (err: unknown) {
    const message = err instanceof Error
      ? err.message
      : (err && typeof err === 'object' && 'message' in err)
        ? String((err as { message: unknown }).message)
        : JSON.stringify(err);
    console.error('[accounting/documents]', err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
