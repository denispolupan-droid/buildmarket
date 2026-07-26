import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/auth-guard';
import { createServiceClient } from '../../../../lib/supabase';
import { getRozetkaChats } from '../../../../lib/rozetka-api';
import { getPromChatRooms } from '../../../../lib/prom-api';

// Обʼєднаний список чатів з покупцями обох маркетплейсів (живі дані, без
// дзеркала в БД). Rozetka: чати по замовленнях + питання про товари.
// Prom: кімнати чату (окремої привʼязки до замовлення API не віддає).

export type MarketplaceChatItem = {
  mp: 'rozetka' | 'prom';
  id: string;                 // rozetka: chat id · prom: room_ident
  subject: string;
  contact: string | null;
  updatedAt: string | null;
  unread: number;
  orderNumber: number | null; // наш номер замовлення (якщо знайдено)
  ourOrderId: string | null;
  receiverId: number | null;  // rozetka: user_id покупця (потрібен для відповіді)
};

export async function GET() {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const items: MarketplaceChatItem[] = [];
  const errors: string[] = [];

  // Rozetka: перша сторінка кожного типу, відсортовано за оновленням — для
  // робочої стрічки цього достатньо (20+20 останніх діалогів)
  const [ordersChats, itemsChats] = await Promise.all([
    getRozetkaChats('orders').catch((e: unknown) => { errors.push(`Rozetka: ${e instanceof Error ? e.message : e}`); return { chats: [] }; }),
    getRozetkaChats('items').catch(() => ({ chats: [] })),
  ]);
  const rzChats = [...ordersChats.chats, ...itemsChats.chats];

  // Привʼязка Rozetka-чатів до наших замовлень
  const rzOrderIds = [...new Set(rzChats.map(c => c.order_id).filter((v): v is number => !!v))];
  const db = createServiceClient();
  const { data: ourOrders } = rzOrderIds.length
    ? await db.from('orders')
        .select('id, order_number, rozetka_order_id')
        .in('rozetka_order_id', rzOrderIds)
        .limit(rzOrderIds.length)
    : { data: [] as never[] };
  const orderByRz = new Map((ourOrders ?? []).map(o => [Number(o.rozetka_order_id), o]));

  for (const c of rzChats) {
    const our = c.order_id ? orderByRz.get(Number(c.order_id)) : null;
    items.push({
      mp: 'rozetka',
      id: String(c.id),
      subject: c.subject ?? (c.order_id ? `Замовлення rz ${c.order_id}` : 'Чат'),
      contact: c.user?.contact_fio?.trim() || null,
      updatedAt: c.updated ?? c.created ?? null,
      unread: Number(c.unread_messages_count) || 0,
      orderNumber: our?.order_number ?? null,
      ourOrderId: our?.id ?? null,
      receiverId: c.user_id ?? c.user?.id ?? null,
    });
  }

  try {
    const rooms = await getPromChatRooms({ limit: 20 });
    for (const r of rooms) {
      items.push({
        mp: 'prom',
        id: r.ident,
        subject: 'Чат з покупцем',
        contact: null,               // імʼя зʼявиться в треді (user_name повідомлень)
        updatedAt: r.date_sent,
        unread: 0,                   // Prom не віддає лічильник на рівні кімнати
        orderNumber: null,
        ourOrderId: null,
        receiverId: null,
      });
    }
  } catch (e: unknown) {
    errors.push(`Prom: ${e instanceof Error ? e.message : e}`);
  }

  items.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  return NextResponse.json({ items, errors });
}
