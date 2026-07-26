import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/auth-guard';
import { createServiceClient } from '../../../../lib/supabase';
import {
  getRozetkaMarketReviews, getRozetkaItemComments,
  replyRozetkaMarketReview, replyRozetkaItemComment,
  markRozetkaMarketReviewRead, markRozetkaItemCommentRead,
} from '../../../../lib/rozetka-api';

// Відгуки Rozetka в адмінці (живі дані): про магазин (з привʼязкою до нашого
// замовлення) і про товари (коментарі та питання). Відповідь і позначення
// прочитаним — одразу на площадку.

export type RozetkaReviewRow = {
  kind: 'market' | 'item';
  id: number;
  author: string | null;
  text: string | null;
  dignity: string | null;
  shortcomings: string | null;
  mark: number | null;          // 1–5 для товарних; null для магазинних
  vote: string | null;          // like/dislike для магазинних
  createdAt: string | null;
  unread: boolean;
  itemTitle: string | null;
  itemId: number | null;        // id товару на Rozetka (потрібен для відповіді на товарний відгук)
  mpOrderId: number | null;
  orderNumber: number | null;
  ourOrderId: string | null;
  ourReply: string | null;      // вже дана відповідь продавця (якщо є)
  replies: Array<{ author: string | null; text: string | null; at: string | null }>;
};

export async function GET() {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  try {
    const [market, items] = await Promise.all([
      getRozetkaMarketReviews(),
      getRozetkaItemComments(),
    ]);

    const rows: RozetkaReviewRow[] = [];

    for (const r of market.reviews) {
      rows.push({
        kind: 'market',
        id: r.id,
        author: r.user,
        text: r.comment,
        dignity: null, shortcomings: null,
        mark: null,
        vote: r.vote ?? null,
        createdAt: r.created_at,
        unread: r.read === false || r.read === 0,
        itemTitle: null,
        itemId: null,
        mpOrderId: r.order_id,
        orderNumber: null,
        ourOrderId: null,
        ourReply: r.order?.current_seller_comment || null,
        replies: [],
      });
    }

    for (const c of items.comments) {
      if (c.parent_id) continue;   // відповіді показуємо всередині материнського
      rows.push({
        kind: 'item',
        id: c.id,
        author: c.name,
        text: c.text,
        dignity: c.dignity || null,
        shortcomings: c.shortcomings || null,
        mark: c.mark || null,
        vote: null,
        createdAt: c.created,
        unread: c.is_reade === false,
        itemTitle: c.record?.title ?? c.item?.name ?? null,
        itemId: Number(c.record?.id) || c.item?.id || null,
        mpOrderId: null,
        orderNumber: null,
        ourOrderId: null,
        ourReply: null,
        replies: (c.children ?? []).map(ch => ({ author: ch.name, text: ch.text, at: ch.created })),
      });
    }

    // Привʼязуємо магазинні відгуки до наших замовлень
    const mpIds = [...new Set(rows.map(r => r.mpOrderId).filter((v): v is number => !!v))];
    if (mpIds.length) {
      const db = createServiceClient();
      const { data: orders } = await db.from('orders')
        .select('id, order_number, rozetka_order_id')
        .in('rozetka_order_id', mpIds)
        .limit(mpIds.length);
      const byRz = new Map((orders ?? []).map(o => [Number(o.rozetka_order_id), o]));
      for (const row of rows) {
        const o = row.mpOrderId ? byRz.get(Number(row.mpOrderId)) : null;
        if (o) { row.orderNumber = o.order_number; row.ourOrderId = o.id; }
      }
    }

    rows.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return NextResponse.json({ rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[rozetka-reviews]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Відповідь на відгук
export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({})) as {
    kind?: string; id?: number; mpOrderId?: number | null; itemId?: number | null; text?: string;
  };
  const text = (body.text ?? '').trim();
  if ((body.kind !== 'market' && body.kind !== 'item') || !body.id || !text) {
    return NextResponse.json({ error: 'Вкажіть текст відповіді' }, { status: 400 });
  }

  try {
    if (body.kind === 'market') {
      if (!body.mpOrderId) return NextResponse.json({ error: 'Невідоме замовлення відгуку' }, { status: 400 });
      await replyRozetkaMarketReview({ marketReviewId: body.id, orderId: body.mpOrderId, comment: text });
    } else {
      await replyRozetkaItemComment({ parentId: body.id, itemId: body.itemId ?? undefined, text });
    }
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[rozetka-reviews/reply]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Позначити прочитаним
export async function PATCH(req: NextRequest) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({})) as { kind?: string; id?: number };
  if ((body.kind !== 'market' && body.kind !== 'item') || !body.id) {
    return NextResponse.json({ error: 'Невірні параметри' }, { status: 400 });
  }
  try {
    if (body.kind === 'market') await markRozetkaMarketReviewRead(body.id);
    else await markRozetkaItemCommentRead(body.id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
