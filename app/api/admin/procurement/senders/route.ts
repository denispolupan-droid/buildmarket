import { NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../lib/supabase';

// Список дозволених відправників для вибору при надсиланні замовлень постачальникам:
// основний (orders_from_*) + додаткові (extra_senders, JSON [{name,email}]).
//
// defaultSender — яку з них підставляти у вікні відправки. Раніше завжди бралася
// перша (основна), і потрібну адресу доводилось перемикати руками щоразу.
// Обирається в Налаштуваннях → Пошта; порожньо означає основну.

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !['admin', 'manager'].includes(user.app_metadata?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = createServiceClient();
  const { data: rows } = await db.from('app_settings').select('key, value')
    .in('key', ['orders_from_email', 'orders_from_name', 'extra_senders', 'orders_default_sender']);
  const cfg: Record<string, string> = {};
  (rows ?? []).forEach(r => { cfg[r.key] = r.value; });

  let extra: { name: string; email: string }[] = [];
  try { const p = JSON.parse(cfg.extra_senders || '[]'); if (Array.isArray(p)) extra = p; } catch { /* ignore */ }

  const senders = [
    { name: cfg.orders_from_name || 'FIXLINE', email: cfg.orders_from_email || 'orders@fixline.com.ua' },
    ...extra,
  ].filter(s => s?.email?.includes('@'));

  // Адресу, якої вже немає в списку, не нав'язуємо — впаде на основну.
  const wanted = (cfg.orders_default_sender ?? '').trim().toLowerCase();
  const defaultSender = senders.find(s => s.email.toLowerCase() === wanted)?.email ?? senders[0]?.email ?? '';

  return NextResponse.json({ senders, defaultSender });
}
