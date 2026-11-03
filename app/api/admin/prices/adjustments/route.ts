import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';
import { fetchAllRows } from '../../../../../lib/db-paginate';
import { ADJ_CHANNELS, adjState, kyivToday, type AdjChannel } from '../../../../../lib/price-adjustments';
import { cancelAdjustments, createAdjustments, targetToChannels } from '../../../../../lib/price-adjustments-db';
import { withApi } from '../../../../../lib/api-handler';

// Корекції цін маркетплейсів (міграція 147): акції й зміни «до дати» поверх
// наценки. Ціни МП рахуються на льоту, тож тут лише записи — без перерахунку
// й без скидання кешу сайту (вітрину корекції МП не зачіпають).
//
// POST  { target: rozetka|prom|mp, type, value, comment?, is_promo?, starts_on?, ends_on?,
//         items: [{ sku, channel, pct }], snapshot? }      — створити
// PATCH { action: 'cancel', log_id }                       — вимкнути корекцію (запис журналу)
// PATCH { action: 'reset', skus, target }                  — вимкнути всі корекції товарів у каналах target
// GET                                                      — живі корекції, згруповані за записом журналу

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

async function _POST(req: NextRequest) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.items)) return NextResponse.json({ error: 'items обовʼязкові' }, { status: 400 });

  const allowed = new Set(targetToChannels(String(body.target ?? '')));
  if (!allowed.size) return NextResponse.json({ error: 'Невідомий target' }, { status: 400 });

  const items: { sku: string; channel: AdjChannel; pct: number }[] = [];
  for (const it of body.items as Record<string, unknown>[]) {
    const sku = typeof it?.sku === 'string' ? it.sku.trim() : '';
    const channel = String(it?.channel ?? '') as AdjChannel;
    const pct = Number(it?.pct);
    if (!sku || !(ADJ_CHANNELS as readonly string[]).includes(channel) || !allowed.has(channel)) {
      return NextResponse.json({ error: `Некоректний рядок: ${sku || '—'} / ${channel}` }, { status: 400 });
    }
    if (!Number.isFinite(pct) || pct <= -100 || pct >= 1000) {
      return NextResponse.json({ error: `Некоректний відсоток у ${sku}: ${String(it?.pct)}` }, { status: 400 });
    }
    items.push({ sku, channel, pct });
  }

  const db = createServiceClient();
  const res = await createAdjustments(db, auth.user.id, {
    log: {
      type: String(body.type ?? 'increase_pct'),
      value: Number(body.value) || 0,
      target: String(body.target),
      comment: typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim() : null,
      count: new Set(items.map(i => i.sku)).size,
      snapshot: Array.isArray(body.snapshot) ? body.snapshot : null,
    },
    items,
    is_promo: !!body.is_promo,
    starts_on: isDate(body.starts_on) ? body.starts_on : null,
    ends_on: isDate(body.ends_on) ? body.ends_on : null,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json(res);
}

export const POST = withApi('admin/prices/adjustments', _POST);

async function _PATCH(req: NextRequest) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const db = createServiceClient();

  let res;
  if (body.action === 'cancel' && Number.isFinite(Number(body.log_id))) {
    res = await cancelAdjustments(db, { logId: Number(body.log_id) }, auth.user.id, { comment: 'Корекцію вимкнено вручну' });
  } else if (body.action === 'reset' && Array.isArray(body.skus) && body.skus.length) {
    const channels = targetToChannels(String(body.target ?? ''));
    if (!channels.length) return NextResponse.json({ error: 'Невідомий target' }, { status: 400 });
    const skus = (body.skus as unknown[]).filter((s): s is string => typeof s === 'string' && !!s);
    res = await cancelAdjustments(db, { skus, channels }, auth.user.id, { comment: 'Повернення до наценки (усі корекції вимкнено)', target: String(body.target) });
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res);
}

export const PATCH = withApi('admin/prices/adjustments', _PATCH);

type Group = {
  log_id: number | null;
  created_at: string | null;
  comment: string | null;
  type: string | null;
  value: number | null;
  target: string | null;
  is_promo: boolean;
  starts_on: string;
  ends_on: string | null;
  state: 'active' | 'scheduled';
  channels: string[];
  skus: number;
  pct_min: number;
  pct_max: number;
};

async function _GET() {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const db = createServiceClient();
  const today = kyivToday();
  const rows = await fetchAllRows((f, t) => db.from('price_adjustments')
    .select('log_id, channel, sku, pct, is_promo, starts_on, ends_on, cancelled_at')
    .is('cancelled_at', null)
    .or(`ends_on.is.null,ends_on.gt.${today}`)
    .order('id').range(f, t));

  const groups = new Map<string, Group & { skuSet: Set<string>; chSet: Set<string> }>();
  for (const r of rows as { log_id: number | null; channel: string; sku: string; pct: number; is_promo: boolean; starts_on: string; ends_on: string | null }[]) {
    const state = adjState({ starts_on: r.starts_on, ends_on: r.ends_on, cancelled_at: null }, today);
    if (state !== 'active' && state !== 'scheduled') continue;
    const k = String(r.log_id ?? 'none');
    const g = groups.get(k) ?? {
      log_id: r.log_id, created_at: null, comment: null, type: null, value: null, target: null,
      is_promo: r.is_promo, starts_on: r.starts_on, ends_on: r.ends_on, state,
      channels: [], skus: 0, pct_min: Number(r.pct), pct_max: Number(r.pct), skuSet: new Set(), chSet: new Set(),
    };
    g.skuSet.add(r.sku); g.chSet.add(r.channel);
    g.pct_min = Math.min(g.pct_min, Number(r.pct)); g.pct_max = Math.max(g.pct_max, Number(r.pct));
    groups.set(k, g);
  }

  const logIds = [...groups.values()].map(g => g.log_id).filter((x): x is number => x != null);
  if (logIds.length) {
    const { data: logs } = await db.from('price_change_log')
      .select('id, created_at, comment, type, value, target').in('id', logIds);
    for (const l of logs ?? []) {
      const g = groups.get(String(l.id));
      if (g) Object.assign(g, { created_at: l.created_at, comment: l.comment, type: l.type, value: Number(l.value), target: l.target });
    }
  }

  const out: Group[] = [...groups.values()]
    .map(({ skuSet, chSet, ...g }) => ({ ...g, skus: skuSet.size, channels: [...chSet] }))
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  return NextResponse.json(out);
}

export const GET = withApi('admin/prices/adjustments', _GET);
