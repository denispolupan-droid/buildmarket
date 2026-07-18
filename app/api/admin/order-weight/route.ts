import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function parseWeightKg(volume: string | null): number {
  if (!volume) return 0;
  // Normalize: comma → dot, collapse spaces, remove space between digits and unit
  const v = volume.trim().replace(',', '.').replace(/\s+/g, ' ').replace(/(\d)\s+(кг|г|л|мл)/i, '$1$2');
  const m = v.match(/^([\d.]+)\s*(кг|г|л|мл|kg|g|l|ml)$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const u = m[2].toLowerCase();
  if (u === 'кг' || u === 'kg')  return n;
  if (u === 'г'  || u === 'g')   return n / 1000;
  if (u === 'л'  || u === 'l')   return n;        // 1 л ≈ 1 кг
  if (u === 'мл' || u === 'ml')  return n / 1000;
  return 0;
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
