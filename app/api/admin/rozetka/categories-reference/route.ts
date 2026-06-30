import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET() {
  const [
    { data: tree },
    { data: refs },
    { data: cats },
  ] = await Promise.all([
    db.from('rozetka_category_tree').select('rz_id, name, commission_rz_id').order('name'),
    db.from('rozetka_commission_refs').select('rz_id, name, commission_pct'),
    db.from('categories')
      .select('name, rozetka_category_id, rozetka_commission_rz_id, rozetka_commission_label, rozetka_commission_pct')
      .not('rozetka_category_id', 'is', null),
  ]);

  // refsMap — only PDF commission categories (the single source of truth for commissions)
  const refsMap = new Map((refs ?? []).map(r => [r.rz_id, r]));

  // Group our site categories by their rozetka_category_id
  type OurCat = { name: string; commission_rz_id: string | null; commission_label: string | null; commission_pct: number | null };
  const catsByRzId = new Map<string, OurCat[]>();
  for (const c of cats ?? []) {
    if (!c.rozetka_category_id) continue;
    const arr = catsByRzId.get(c.rozetka_category_id) ?? [];
    arr.push({
      name:            c.name,
      commission_rz_id: c.rozetka_commission_rz_id ?? null,
      commission_label: c.rozetka_commission_label ?? null,
      commission_pct:   c.rozetka_commission_pct != null ? Number(c.rozetka_commission_pct) : null,
    });
    catsByRzId.set(c.rozetka_category_id, arr);
  }

  const result = (tree ?? []).map(t => {
    const ourCats = catsByRzId.get(t.rz_id) ?? [];

    // Priority 1: our categories table (user-verified)
    const catWithCommission = ourCats.find(c => c.commission_rz_id);
    if (catWithCommission?.commission_rz_id) {
      const ref = refsMap.get(catWithCommission.commission_rz_id);
      return {
        rz_id:            t.rz_id,
        rz_name:          t.name,
        commission_rz_id: catWithCommission.commission_rz_id,
        commission_name:  catWithCommission.commission_label ?? ref?.name ?? null,
        commission_pct:   catWithCommission.commission_pct ?? ref?.commission_pct ?? null,
        our_categories:   ourCats.map(c => c.name),
      };
    }

    // Priority 2: tree's commission_rz_id — only if it actually exists in the PDF
    const treeCommission = t.commission_rz_id ? refsMap.get(t.commission_rz_id) : null;
    return {
      rz_id:            t.rz_id,
      rz_name:          t.name,
      commission_rz_id: treeCommission ? t.commission_rz_id : null,
      commission_name:  treeCommission?.name ?? null,
      commission_pct:   treeCommission?.commission_pct ?? null,
      our_categories:   ourCats.map(c => c.name),
    };
  });

  return NextResponse.json(result);
}
