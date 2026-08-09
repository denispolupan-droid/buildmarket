import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';

/**
 * Порядок кореневих категорій. Зберігаємо в categories.sort_order — тому самому
 * полі, за яким категорії сортуються скрізь (головна, сайдбар магазину й
 * каталогу). Окреме сховище для «порядку на головній» створило б друге джерело
 * правди й розʼїхалось би з рештою сайту.
 */

type Row = {
  slug: string;
  name: string;
  sortOrder: number;
  /** Активних товарів у родині (разом із підкатегоріями) — щоб було видно, що виносити вперед */
  products: number;
};

async function loadRoots(): Promise<Row[]> {
  const db = createServiceClient();
  const { data: cats, error } = await db
    .from('categories')
    .select('slug, name, sort_order, parent_slug')
    .order('sort_order');
  if (error) throw error;

  type Cat = { slug: string; name: string; sort_order: number; parent_slug: string | null };
  const all = (cats ?? []) as Cat[];
  const rootOf = new Map(all.map(c => [c.slug, c.parent_slug ?? c.slug]));

  // Один легкий запит замість лічильника на кожну категорію
  const { data: prods } = await db
    .from('products')
    .select('category_slug')
    .eq('is_active', true)
    .limit(5000);
  const counts: Record<string, number> = {};
  for (const p of (prods ?? []) as { category_slug: string | null }[]) {
    const root = rootOf.get(p.category_slug ?? '');
    if (root) counts[root] = (counts[root] ?? 0) + 1;
  }

  return all
    .filter(c => !c.parent_slug)
    .map(c => ({ slug: c.slug, name: c.name, sortOrder: c.sort_order, products: counts[c.slug] ?? 0 }));
}

export async function GET() {
  const gate = await requireStaff('admin', 'manager');
  if (!gate.ok) return gate.response;
  return NextResponse.json({ categories: await loadRoots() });
}

export async function PUT(req: NextRequest) {
  const gate = await requireStaff('admin');
  if (!gate.ok) return gate.response;

  const { slugs } = await req.json() as { slugs?: unknown };
  if (!Array.isArray(slugs) || slugs.some(s => typeof s !== 'string')) {
    return NextResponse.json({ error: 'slugs має бути масивом рядків' }, { status: 400 });
  }
  const clean = [...new Set(slugs as string[])].map(s => s.trim()).filter(Boolean);

  const db = createServiceClient();
  const { data: roots } = await db
    .from('categories')
    .select('slug')
    .is('parent_slug', null);
  const known = new Set((roots ?? []).map(r => r.slug as string));

  const unknown = clean.filter(s => !known.has(s));
  if (unknown.length) {
    return NextResponse.json({ error: `Невідомі категорії: ${unknown.join(', ')}` }, { status: 400 });
  }
  // Порядок задають ПОВНИМ списком: часткове збереження лишило б категорії поза
  // списком із випадковими номерами і тихо перемішало б головну.
  if (clean.length !== known.size) {
    return NextResponse.json(
      { error: `Очікується повний список кореневих категорій (${known.size}), отримано ${clean.length}` },
      { status: 400 },
    );
  }

  // Крок 10, як і в наявних даних (10…120): лишає місце вставити категорію
  // між сусідами руками, не перебудовуючи весь список.
  for (let i = 0; i < clean.length; i++) {
    const { error } = await db.from('categories').update({ sort_order: (i + 1) * 10 }).eq('slug', clean[i]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('categories', 'max');
  return NextResponse.json({ ok: true, categories: await loadRoots() });
}
