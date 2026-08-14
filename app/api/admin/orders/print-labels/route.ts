import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';
import { getNpApiKey, npMarkingPdf } from '../../../../../lib/np-api';
import { rzLabel } from '../../../../../lib/rz-delivery-api';
import { getRozetkaDeliveryTtnPdf } from '../../../../../lib/rozetka-delivery-ttn';
import { RZ_DELIVERY_TYPE } from '../../../../../lib/rz-delivery';
import { ROZETKA_DELIVERY_TYPE } from '../../../../../lib/rozetka-delivery';

/**
 * Групова печатка етикеток по вибраних замовленнях — ОДИН PDF на всі.
 *
 * Три перевізники, три різні API етикеток: НП (маркування 100×100 з
 * my.novaposhta.ua), власний договір rz-delivery і МП-накладні в точки видачі
 * Rozetka (Seller API). Кожен віддає свій PDF пачкою — тут вони склеюються
 * pdf-lib'ом у спільний документ, щоб на друк ішов один файл, а не три вкладки.
 * Якщо якийсь перевізник відмовив — решта все одно друкується, а помилка
 * повертається текстом поруч із label.
 */

const NP_CHUNK = 50; // номери йдуть прямо в URL — не даємо йому рости безмежно

const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({})) as { orderIds?: unknown };
  const ids = Array.isArray(body.orderIds)
    ? body.orderIds.filter((x): x is string => typeof x === 'string').slice(0, 200)
    : [];
  if (!ids.length) return NextResponse.json({ error: 'Порожній список замовлень' }, { status: 400 });

  const db = createServiceClient();
  const { data: orders } = await db
    .from('orders')
    .select('id, order_number, tracking_number, delivery_type')
    .in('id', ids)
    .limit(ids.length);

  const rows = orders ?? [];
  const ttnOf = (types: string[]) =>
    rows.filter(o => o.tracking_number && types.includes(o.delivery_type ?? ''))
      .map(o => o.tracking_number as string);
  const npTtns = ttnOf(['nova', 'nova_poshta']);
  const mpTtns = ttnOf([ROZETKA_DELIVERY_TYPE]);
  const rzTtns = ttnOf([RZ_DELIVERY_TYPE]);
  // Без накладної або з перевізником, у якого немає друкованої форми — у «пропущені»
  const printable = new Set([...npTtns, ...mpTtns, ...rzTtns]);
  const skipped = rows.filter(o => !o.tracking_number || !printable.has(o.tracking_number)).map(o => o.order_number);

  if (!npTtns.length && !mpTtns.length && !rzTtns.length) {
    return NextResponse.json({ error: 'Серед вибраних немає накладних із етикетками (НП чи Rozetka)' }, { status: 400 });
  }

  // Порядок частин стабільний: НП → точки видачі Rozetka → ROZETKA Доставка
  const tasks: { name: string; run: () => Promise<Buffer[]> }[] = [];
  if (npTtns.length) tasks.push({
    name: 'НП',
    run: async () => {
      const key = await getNpApiKey();
      return Promise.all(chunk(npTtns, NP_CHUNK).map(c => npMarkingPdf(key, c)));
    },
  });
  if (mpTtns.length) tasks.push({
    name: 'Rozetka (точки видачі)',
    run: async () => [Buffer.from(await getRozetkaDeliveryTtnPdf(mpTtns), 'base64')],
  });
  if (rzTtns.length) tasks.push({
    name: 'ROZETKA Доставка',
    run: async () => [Buffer.from(await rzLabel(rzTtns), 'base64')],
  });

  const settled = await Promise.allSettled(tasks.map(t => t.run()));
  const parts: Buffer[] = [];
  const errors: string[] = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') parts.push(...r.value);
    else errors.push(`${tasks[i].name}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
  });

  if (!parts.length) {
    return NextResponse.json({ error: errors.join('; ') || 'Жоден перевізник не віддав етикетки' }, { status: 502 });
  }

  const merged = await PDFDocument.create();
  for (const part of parts) {
    const doc = await PDFDocument.load(part, { ignoreEncryption: true });
    (await merged.copyPages(doc, doc.getPageIndices())).forEach(p => merged.addPage(p));
  }

  return NextResponse.json({
    label: Buffer.from(await merged.save()).toString('base64'),
    counts: { np: npTtns.length, rozetkaPickup: mpTtns.length, rzDelivery: rzTtns.length },
    skipped,
    errors,
  });
}
