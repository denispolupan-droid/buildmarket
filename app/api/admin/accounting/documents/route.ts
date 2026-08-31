import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../lib/supabase';
import { createDocument, confirmDocument, cancelDocument, correctDocument } from '../../../../../lib/accounting/documents';
import type { CreateDocumentInput } from '../../../../../lib/accounting/types';
import { parseSaleLines } from '../../../../../lib/accounting/sale-lines';
import { checkSaleEdit, recordSaleEdit } from '../../../../../lib/accounting/edit-journal';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
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

    // Правка складу видаткової — ТІЛЬКИ поки вона чернетка.
    //
    // Межа тут не формальна. Проведена накладна вже створила рухи складу,
    // виручку й COGS; мовчки переписати їй рядки означало б, що друкована
    // форма й облік почнуть жити окремо — а вона виписана під наш ФОП і ДРФО,
    // тож саме за неї відповідаємо ми. Для проведеної шлях один: «Виправити»
    // (сторно + нова чернетка), і він уже є.
    if (action === 'update_lines') {
      const db = createServiceClient();
      const { data: doc } = await db
        .from('acc_documents')
        .select('id, doc_type, status, doc_number, warehouse_id, total_amount, meta')
        .eq('id', document_id)
        .single();

      if (!doc) return NextResponse.json({ error: 'Документ не знайдено' }, { status: 404 });
      if (doc.doc_type !== 'sale') {
        return NextResponse.json({ error: 'Редагувати рядки можна лише у видатковій' }, { status: 400 });
      }
      if (doc.status !== 'draft') {
        return NextResponse.json({
          error: doc.status === 'confirmed'
            ? `${doc.doc_number} уже проведена. Щоб змінити склад — «Виправити»: вона сторнується, і правки вносяться в нову чернетку.`
            : `${doc.doc_number} скасована — редагувати нічого.`,
        }, { status: 409 });
      }

      // Розбір і підсумок — у чистій функції під тестами: сума накладної
      // рахується на сервері, з тіла беремо тільки склад.
      const parsed = parseSaleLines(body.lines);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      const clean = parsed.lines;

      const { data: known } = await db.from('products').select('sku').in('sku', clean.map(l => l.sku));
      const knownSkus = new Set((known ?? []).map(p => p.sku));
      const unknown = clean.find(l => !knownSkus.has(l.sku));
      if (unknown) {
        return NextResponse.json({ error: `Артикул ${unknown.sku} не знайдено в каталозі` }, { status: 400 });
      }

      // Склад і тип виконання переносимо зі старих рядків: від них залежить,
      // з якої партії FIFO спише товар при проведенні. Новий рядок успадковує
      // їх у першого наявного — видаткова відвантажується з одного місця.
      const { data: oldLines } = await db
        .from('acc_document_lines')
        .select('sku, cost_price, warehouse_id, fulfillment_type, supplier_id, uom_code, uom_factor, exchange_rate')
        .eq('document_id', document_id)
        .order('sort_order');
      const prev = new Map((oldLines ?? []).map(l => [l.sku, l]));
      const sample = (oldLines ?? [])[0];

      const rows = clean.map((l, i) => {
        const base = prev.get(l.sku) ?? sample;
        return {
          document_id:      document_id,
          sku:              l.sku,
          qty:              l.qty,
          price:            l.price,
          // Собівартість не вигадуємо: у продажу її дає FIFO при проведенні.
          cost_price:       prev.get(l.sku)?.cost_price ?? null,
          warehouse_id:     base?.warehouse_id ?? doc.warehouse_id ?? null,
          fulfillment_type: base?.fulfillment_type ?? 'own',
          supplier_id:      base?.supplier_id ?? null,
          uom_code:         base?.uom_code ?? null,
          uom_factor:       base?.uom_factor ?? 1,
          exchange_rate:    base?.exchange_rate ?? 1,
          sort_order:       i,
        };
      });

      const total = parsed.total;

      // Той самий страж, що й на правці замовлення: правило не має залежати
      // від того, з якого екрана прийшли. Поки він лише спостерігає — див.
      // EDIT_GUARD_ENFORCE у lib/accounting/sale-edit-guard.
      const editCtx = await checkSaleEdit({
        documentId: document_id,
        source: 'sale-doc',
        totalAfter: total,
        dateAfter: typeof body.doc_date === 'string' && body.doc_date ? body.doc_date : null,
      });
      if (!editCtx.verdict.allowed) {
        await recordSaleEdit(editCtx, {
          by: user.email ?? 'admin', totalAfter: total,
          dateAfter: typeof body.doc_date === 'string' ? body.doc_date : null,
          itemsBefore: oldLines ?? null, itemsAfter: clean, blocked: true,
        });
        return NextResponse.json({
          error: editCtx.verdict.blockers[0].message,
          blockers: editCtx.verdict.blockers.map(b => b.message),
        }, { status: 409 });
      }

      await db.from('acc_document_lines').delete().eq('document_id', document_id);
      const { error: insErr } = await db.from('acc_document_lines').insert(rows);
      if (insErr) throw new Error(insErr.message);

      // Слід правки. Чернетку можна переписувати скільки завгодно, але «хто і
      // коли міняв суму» має лишатись у документі: без цього неможливо
      // відповісти, чому надрукована накладна відрізняється від тієї, яку
      // бачив менеджер учора.
      const meta = (doc.meta ?? {}) as Record<string, unknown>;
      const edits = Array.isArray(meta.line_edits) ? meta.line_edits as unknown[] : [];
      edits.push({
        at:            new Date().toISOString(),
        by:            user.email ?? 'admin',
        total_before:  Number(doc.total_amount ?? 0),
        total_after:   total,
        lines_before:  (oldLines ?? []).length,
        lines_after:   rows.length,
      });

      const patch: Record<string, unknown> = {
        total_amount: total,
        meta: { ...meta, line_edits: edits.slice(-20) },
      };
      if (typeof body.doc_date === 'string' && body.doc_date) {
        const d = new Date(body.doc_date);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: 'Некоректна дата документа' }, { status: 400 });
        }
        patch.doc_date = d.toISOString();
      }
      await db.from('acc_documents').update(patch).eq('id', document_id);

      await recordSaleEdit(editCtx, {
        by: user.email ?? 'admin', totalAfter: total,
        dateAfter: typeof body.doc_date === 'string' ? body.doc_date : null,
        itemsBefore: oldLines ?? null, itemsAfter: clean, blocked: false,
      });

      return NextResponse.json({
        ok: true, total, lines: rows.length,
        ...(editCtx.verdict.warnings.length
          ? { warnings: editCtx.verdict.warnings.map(w => w.message) }
          : {}),
      });
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
