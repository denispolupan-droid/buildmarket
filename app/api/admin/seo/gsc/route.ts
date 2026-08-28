import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { dateWindow, getPages, getQueries, type GscPageRow, type GscQueryRow } from '../../../../../lib/gsc';
import { createServiceClient } from '../../../../../lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Дані Search Console для розділу SEO (читання, безкоштовно).
//   ?view=queries — запити (за замовчуванням), ?view=pages — зріз по сторінках
//   ?days=7|28|90, ?min/&max — діапазон позицій, ?compare=1 — плюс попередній період
//
// Повний звіт обходиться посторінково (див. lib/gsc.ts): раніше бралися лише
// перші 500 рядків, а Google сортує їх за кліками — тобто відрізало саме ті
// запити з показами й нулем кліків, заради яких розділ і існує.

type Prev = { clicks: number; impressions: number; position: number } | null;

const norm = (page: string) => page.replace(/^https?:\/\/[^/]+/i, '').replace(/[?#].*$/, '') || '/';

const queryKey = (query: string, path: string) => JSON.stringify([query, path]);

export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const viewParam = sp.get('view');
  const view = viewParam === 'pages' ? 'pages' : viewParam === 'demand' ? 'demand' : 'queries';
  const days = Math.min(Math.max(Number(sp.get('days') ?? 28), 1), 480);
  const limit = Math.min(Number(sp.get('limit') ?? 200), 5000);
  const compare = sp.get('compare') === '1';

  try {
    if (view === 'pages') {
      const [cur, prev] = await Promise.all([
        getPages({ days }),
        compare ? getPages({ days, shiftPeriods: 1 }) : Promise.resolve([] as GscPageRow[]),
      ]);
      const prevBy = new Map(prev.map(p => [norm(p.page), p]));
      const rows = cur.slice(0, limit).map(p => ({
        ...p,
        path: norm(p.page),
        prev: toPrev(prevBy.get(norm(p.page))),
      }));
      return NextResponse.json({ window: dateWindow(days), total: cur.length, rows });
    }

    if (view === 'demand') return NextResponse.json(await demandView(days, limit));

    const minPosition = Number(sp.get('min') ?? 0);
    const maxPosition = Number(sp.get('max') ?? 1000);
    const [cur, prev] = await Promise.all([
      getQueries({ days, minPosition, maxPosition }),
      compare ? getQueries({ days, shiftPeriods: 1 }) : Promise.resolve([] as GscQueryRow[]),
    ]);
    const prevBy = new Map(prev.map(r => [queryKey(r.query, norm(r.page)), r]));
    const rows = cur.slice(0, limit).map(r => ({
      ...r,
      path: norm(r.page),
      prev: toPrev(prevBy.get(queryKey(r.query, norm(r.page)))),
    }));
    return NextResponse.json({ window: dateWindow(days), total: cur.length, rows });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

function toPrev(row?: { clicks: number; impressions: number; position: number }): Prev {
  return row ? { clicks: row.clicks, impressions: row.impressions, position: row.position } : null;
}

// ── view=demand: попит очима покупця, а не сторінки ──────────────────────────
//
// Вкладка «Запити» відповідає на «що вже приносить трафік». Тут інше питання:
// ЩО ЛЮДИ ШУКАЮТЬ — по товарах і по темах, яких у нас на сайті ще немає.
//
// Два зрізи з одного й того ж звіту Search Console (запит + сторінка):
//   products — попит, який уже веде на картку товару. Видно, скільки показів
//              збирає сам товар і якими словами його шукають;
//   gaps     — запити, що сідають НЕ на товар (категорія, блог, головна). Це і є
//              найцікавіше для закупівлі: попит є, окремої картки під нього немає.
//
// Важлива межа, про яку слід памʼятати: Search Console показує лише ті запити,
// де сайт УЖЕ показувався. Попит, якого ми не торкаємось узагалі, сюди не
// потрапляє — для нього потрібен Планувальник ключових слів Google Ads.
async function demandView(days: number, limit: number) {
  const rows = await getQueries({ days });

  type Agg = { impressions: number; clicks: number; posSum: number; phrases: Map<string, { impressions: number; clicks: number; position: number }> };
  const bySlug = new Map<string, Agg>();
  const gaps = new Map<string, { path: string; impressions: number; clicks: number; posSum: number }>();

  const blank = (): Agg => ({ impressions: 0, clicks: 0, posSum: 0, phrases: new Map() });

  for (const r of rows) {
    const path = norm(r.page);
    // Російська версія живе під /ru/ — без неї половина карток потрапляла б у
    // «попит без товару». Ключем може бути і ЧПУ, і артикул: /product/<sku>
    // 308-редіректить на слаг, але Google памʼятає обидві адреси.
    const m = path.match(/^(?:\/ru)?\/product\/([^/?#]+)/);
    if (m) {
      const slug = decodeURIComponent(m[1]);
      if (!bySlug.has(slug)) bySlug.set(slug, blank());
      const a = bySlug.get(slug)!;
      a.impressions += r.impressions;
      a.clicks      += r.clicks;
      a.posSum      += r.position * r.impressions;   // середня позиція, зважена показами
      const p = a.phrases.get(r.query) ?? { impressions: 0, clicks: 0, position: r.position };
      p.impressions += r.impressions;
      p.clicks      += r.clicks;
      p.position     = r.position;
      a.phrases.set(r.query, p);
    } else {
      const g = gaps.get(r.query) ?? { path, impressions: 0, clicks: 0, posSum: 0 };
      g.impressions += r.impressions;
      g.clicks      += r.clicks;
      g.posSum      += r.position * r.impressions;
      gaps.set(r.query, g);
    }
  }

  // Довідка по товарах: назва, наявність і ціна — щоб «високий попит + немає в
  // наявності» читалось одразу, без переходу в картку.
  const slugs = [...bySlug.keys()];
  const db = createServiceClient();
  const products: { slug: string; sku: string; name: string; brand: string | null }[] = [];
  for (let i = 0; i < slugs.length; i += 200) {
    const chunk = slugs.slice(i, i + 200);
    const [bySlugRes, bySkuRes] = await Promise.all([
      db.from('products').select('slug, sku, name, brand').in('slug', chunk),
      db.from('products').select('slug, sku, name, brand').in('sku', chunk),
    ]);
    products.push(...(bySlugRes.data ?? []) as typeof products);
    products.push(...(bySkuRes.data ?? []) as typeof products);
  }
  const bySkuStock = new Map<string, { stock_status: string | null; stock_qty: number | null; price: number | null }>();
  const skus = products.map(p => p.sku);
  for (let i = 0; i < skus.length; i += 200) {
    const { data } = await db
      .from('product_stock')
      .select('sku, stock_status, stock_qty, price_retail')
      .in('sku', skus.slice(i, i + 200));
    for (const s of data ?? []) {
      bySkuStock.set(s.sku as string, {
        stock_status: (s.stock_status as string) ?? null,
        stock_qty:    (s.stock_qty as number) ?? null,
        price:        (s.price_retail as number) ?? null,
      });
    }
  }
  // Ключ адреси → товар: адреса могла бути і слагом, і артикулом.
  const productByKey = new Map<string, typeof products[number]>();
  for (const p of products) {
    if (p.slug) productByKey.set(p.slug, p);
    productByKey.set(p.sku, p);
  }

  // Зводимо два написання однієї адреси в один товар — інакше він двоївся б у
  // списку і жодне з двох чисел не було б повним.
  const merged = new Map<string, { key: string; slug: string; product?: typeof products[number]; agg: Agg }>();
  for (const [key, a] of bySlug) {
    const p = productByKey.get(key);
    const id = p?.sku ?? key;
    const cur = merged.get(id);
    if (!cur) {
      merged.set(id, { key: id, slug: p?.slug ?? key, product: p, agg: a });
      continue;
    }
    cur.agg.impressions += a.impressions;
    cur.agg.clicks      += a.clicks;
    cur.agg.posSum      += a.posSum;
    for (const [q, v] of a.phrases) {
      const prev = cur.agg.phrases.get(q);
      cur.agg.phrases.set(q, prev
        ? { impressions: prev.impressions + v.impressions, clicks: prev.clicks + v.clicks, position: prev.position }
        : v);
    }
  }

  const productRows = [...merged.values()]
    .map(({ slug, product: p, agg: a }) => {
      const stock = p ? bySkuStock.get(p.sku) : undefined;
      return {
        slug,
        sku:   p?.sku   ?? null,
        name:  p?.name  ?? slug,
        brand: p?.brand ?? null,
        impressions: a.impressions,
        clicks:      a.clicks,
        position:    a.impressions > 0 ? Math.round((a.posSum / a.impressions) * 10) / 10 : 0,
        in_stock:    stock ? stock.stock_status === 'in_stock' : null,
        price:       stock?.price ?? null,
        phrases: [...a.phrases.entries()]
          .sort((x, y) => y[1].impressions - x[1].impressions)
          .slice(0, 5)
          .map(([query, v]) => ({ query, impressions: v.impressions, clicks: v.clicks, position: Math.round(v.position * 10) / 10 })),
      };
    })
    .sort((x, y) => y.impressions - x.impressions);

  const gapRows = [...gaps.entries()]
    .map(([query, g]) => ({
      query,
      path: g.path,
      impressions: g.impressions,
      clicks: g.clicks,
      position: g.impressions > 0 ? Math.round((g.posSum / g.impressions) * 10) / 10 : 0,
    }))
    .sort((x, y) => y.impressions - x.impressions);

  return {
    window: dateWindow(days),
    products: productRows.slice(0, limit),
    gaps:     gapRows.slice(0, limit),
    totals: {
      products: productRows.length,
      gaps:     gapRows.length,
    },
  };
}
