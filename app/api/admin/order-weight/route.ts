import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseWeightKg } from '../../../../lib/parcel-weight';
import { requireStaff } from '../../../../lib/auth-guard';

// Розбір фасування живе в lib/parcel-weight: ту саму вагу тепер рахує і чекаут
// (ліміт точки видачі ROZETKA), і серверна перевірка замовлення. Дві копії
// регулярки розійшлися б при першій же новій одиниці виміру.

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const { items }: { items: { sku: string; qty: number }[] } = await req.json();
  if (!items?.length) return NextResponse.json({ totalWeightKg: 0, lines: [] });

  const skus = items.map(i => i.sku);
  const { data: products } = await serviceClient
    .from('products')
    .select('sku, volume')
    .in('sku', skus);

  const volumeMap: Record<string, string | null> = {};
  (products ?? []).forEach(p => { volumeMap[p.sku] = p.volume; });

  const lines = items.map(({ sku, qty }) => {
    const volume = volumeMap[sku] ?? null;
    const weightKg = parseWeightKg(volume);
    return { sku, volume, weightKg, qty, totalKg: parseFloat((weightKg * qty).toFixed(3)) };
  });

  const totalWeightKg = parseFloat(lines.reduce((s, l) => s + l.totalKg, 0).toFixed(2));

  return NextResponse.json({ totalWeightKg, lines });
}
