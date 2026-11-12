import { NextRequest, NextResponse } from 'next/server';
import { parseWeightKg } from '../../../../lib/parcel-weight';
import { itemPackage, suggestParcelBox } from '../../../../lib/package-dims';
import { requireStaff } from '../../../../lib/auth-guard';
import { createServiceClient } from '../../../../lib/supabase-service';
import { withApi } from '../../../../lib/api-handler';

// Розбір фасування живе в lib/parcel-weight: ту саму вагу тепер рахує і чекаут
// (ліміт точки видачі ROZETKA), і серверна перевірка замовлення. Дві копії
// регулярки розійшлися б при першій же новій одиниці виміру.
//
// З 12.11.2026 тут же — пропозиція коробки (lib/package-dims): габарити товарів
// з картки або оцінка за назвою й вагою → найменша типова коробка. Вікна
// накладних підставляють її самі (крім звичайного відділення НП — там підказка).

const serviceClient = createServiceClient();

async function _POST(req: NextRequest) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const { items }: { items: { sku: string; qty: number }[] } = await req.json();
  if (!items?.length) return NextResponse.json({ totalWeightKg: 0, lines: [], box: null });

  const skus = items.map(i => i.sku);
  const { data: products } = await serviceClient
    .from('products')
    .select('sku, name, volume, package_length_mm, package_width_mm, package_height_mm')
    .in('sku', skus)
    .limit(skus.length);

  type P = { sku: string; name: string | null; volume: string | null; package_length_mm: number | null; package_width_mm: number | null; package_height_mm: number | null };
  const bySku = new Map<string, P>(((products ?? []) as P[]).map(p => [p.sku, p]));

  const lines = items.map(({ sku, qty }) => {
    const p = bySku.get(sku);
    const volume = p?.volume ?? null;
    const weightKg = parseWeightKg(volume);
    const pkg = itemPackage({ ...p, name: p?.name ?? '', weightG: weightKg * 1000 });
    return {
      sku, volume, weightKg, qty, totalKg: parseFloat((weightKg * qty).toFixed(3)),
      packageMm: pkg.dims, packageKind: pkg.kind, packageManual: pkg.manual,
    };
  });

  const totalWeightKg = parseFloat(lines.reduce((s, l) => s + l.totalKg, 0).toFixed(2));
  const box = suggestParcelBox(lines.filter(l => bySku.has(l.sku)).map(l => ({ dims: l.packageMm, qty: l.qty })));

  return NextResponse.json({ totalWeightKg, lines, box });
}

export const POST = withApi('admin/order-weight', _POST);
