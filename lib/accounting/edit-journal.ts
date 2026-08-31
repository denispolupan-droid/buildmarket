/**
 * Журнал і перевірка ручних правок продажу.
 *
 * Збирає з БД факти, потрібні чистому стражу (lib/accounting/sale-edit-guard),
 * і лишає слід кожної правки: хто, коли, звідки, що було й що стало, які
 * зауваження при цьому спрацювали.
 *
 * Жодна з функцій не має права зірвати збереження: журнал — це спостереження,
 * а не частина транзакції. Якщо таблиці ще немає або запит впав, менеджер має
 * спокійно зберегти документ, а ми — побачити проблему в логах.
 */

import { createServiceClient } from '../supabase';
import { alertAdmin } from '../alert';
import { evaluateSaleEdit, type SaleEditIssue, type SaleEditSource, type SaleEditVerdict } from './sale-edit-guard';

const EMPTY: SaleEditVerdict = { issues: [], blockers: [], warnings: [], allowed: true };

export type SaleEditContext = {
  orderId: string | null;
  documentId: string | null;
  source: SaleEditSource;
  verdict: SaleEditVerdict;
  totalBefore: number;
  dateBefore: string | null;
};

/**
 * Що не так із цією правкою. Повертає вердикт; блокувати чи ні — вирішує
 * викликач (у режимі спостереження verdict.allowed завжди true).
 */
export async function checkSaleEdit(input: {
  orderId?: string | null;
  documentId?: string | null;
  source: SaleEditSource;
  totalAfter?: number;
  dateAfter?: string | null;
}): Promise<SaleEditContext> {
  const base: SaleEditContext = {
    orderId: input.orderId ?? null,
    documentId: input.documentId ?? null,
    source: input.source,
    verdict: EMPTY,
    totalBefore: 0,
    dateBefore: null,
  };

  try {
    const db = createServiceClient();
    let orderId = input.orderId ?? null;
    let totalBefore = 0;
    let dateBefore: string | null = null;

    if (input.documentId) {
      const { data: doc } = await db
        .from('acc_documents')
        .select('order_id, total_amount, doc_date')
        .eq('id', input.documentId)
        .maybeSingle();
      orderId = orderId ?? (doc?.order_id ?? null);
      totalBefore = Number(doc?.total_amount ?? 0);
      dateBefore = doc?.doc_date ?? null;
    }

    // Джерело правди для суми/дати «до» — сам об'єкт, який правлять. Для
    // рахунку й картки це замовлення, для видаткової — документ (вище).
    let amountPaid = 0;
    let channelCode: string | null = null;
    if (orderId) {
      const { data: order } = await db
        .from('orders')
        .select('total_price, amount_paid, channel_code, created_at')
        .eq('id', orderId)
        .maybeSingle();
      amountPaid = Number(order?.amount_paid ?? 0);
      channelCode = order?.channel_code ?? null;
      if (!input.documentId) {
        totalBefore = Number(order?.total_price ?? 0);
        dateBefore = order?.created_at ?? null;
      }
    }

    const [{ data: docs }, { data: periods }] = await Promise.all([
      orderId
        ? db.from('acc_documents').select('status').eq('order_id', orderId).eq('doc_type', 'sale')
        : Promise.resolve({ data: [] as { status: string }[] }),
      db.from('acc_periods').select('period').not('closed_at', 'is', null),
    ]);

    const all = (docs ?? []) as { status: string }[];

    const verdict = evaluateSaleEdit({
      source: input.source,
      confirmedDocs: all.filter(d => d.status === 'confirmed').length,
      draftDocs: all.filter(d => d.status === 'draft').length,
      amountPaid,
      channelCode,
      closedPeriods: (periods ?? []).map(p => String(p.period).slice(0, 7)),
      totalBefore,
      // Суму не міняють — порівнюємо з нею ж, щоб не ловити хибних «різких змін».
      totalAfter: input.totalAfter ?? totalBefore,
      dateBefore,
      dateAfter: input.dateAfter ?? null,
      now: new Date(),
    });

    return { ...base, orderId, verdict, totalBefore, dateBefore };
  } catch (err) {
    // Не змогли зібрати факти — правку все одно пропускаємо, але слід лишаємо.
    console.error('[edit-guard] не вдалось перевірити правку', err);
    return base;
  }
}

/** Слід правки в журналі. Ніколи не кидає — збереження від нього не залежить. */
export async function recordSaleEdit(ctx: SaleEditContext, input: {
  by: string;
  totalAfter: number;
  dateAfter?: string | null;
  itemsBefore?: unknown;
  itemsAfter?: unknown;
  blocked: boolean;
}): Promise<void> {
  try {
    const db = createServiceClient();
    await db.from('order_edits').insert({
      order_id:     ctx.orderId,
      document_id:  ctx.documentId,
      source:       ctx.source,
      edited_by:    input.by,
      total_before: ctx.totalBefore,
      total_after:  input.totalAfter,
      date_before:  ctx.dateBefore,
      date_after:   input.dateAfter ?? null,
      items_before: input.itemsBefore ?? null,
      items_after:  input.itemsAfter ?? null,
      issues:       ctx.verdict.issues,
      blocked:      input.blocked,
    });
  } catch (err) {
    console.error('[edit-guard] журнал правки не записався', err);
  }

  // Блокер, який ми пропустили (режим спостереження), має бути помічений
  // одразу, а не через місяць при звірці.
  if (!input.blocked && ctx.verdict.blockers.length) {
    alertAdmin(
      `Правка продажу зачепила облік (${ctx.source}, замовлення ${ctx.orderId ?? '—'})`,
      [
        `Хто: ${input.by}`,
        `Сума: ${ctx.totalBefore} → ${input.totalAfter}`,
        ...ctx.verdict.blockers.map(b => `• ${b.message}`),
      ].join('\n'),
    );
  }
}

export type { SaleEditIssue };
