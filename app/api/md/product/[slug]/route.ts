import { NextResponse } from 'next/server';
import {
  getProductBySlugCached, getProductBySkuCached, getCategoriesCached,
  getProductFaqCached, getRelatedProductsCached, getReviewStatsCached,
} from '../../../../../lib/supabase';
import { productMarkdown, mdPrice, type MdProductInput } from '../../../../../lib/llms-md';
import { SITE_URL } from '../../../../../lib/site';

// Markdown-версія картки товару. Публічна адреса — /product/<slug>.md,
// сюди веде rewrite з next.config: розширення в кінці URL моделі шукають
// самі, а тримати роут з крапкою в сегменті App Router не дає.
//
// Кешуємо на годину: дані ті самі, що на сторінці, а бот-краулер здатен
// вигребти весь каталог за один захід — без кешу це прямий удар по БД.

export const revalidate = 3600;

// canonical у HTTP-заголовку, а не `noindex`.
//
// Різниця принципова. `noindex` прибрав би дубль з Google — і разом з ним
// прибрав би сенс усієї витівки: пошукові боти ШІ (OAI-SearchBot і подібні)
// теж читають цю директиву й просто не візьмуть сторінку в індекс відповідей.
// canonical же каже «це та сама сторінка, оригінал ось», не забороняючи читати:
// Google схлопує дубль, модель отримує текст.
const md = (body: string, canonical: string, status = 200) =>
  new NextResponse(body, {
    status,
    headers: {
      // charset обов'язковий: без нього кирилиця приїжджає крякозябрами
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      Link: `<${canonical}>; rel="canonical"`,
    },
  });

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params;
  const slug = decodeURIComponent(raw);

  const product = (await getProductBySlugCached(slug)) ?? (await getProductBySkuCached(slug));
  if (!product) {
    const url = `${SITE_URL}/product/${slug}`;
    return md(`# Товар не знайдено\n\nСторінка ${url} недоступна.\nКаталог: ${SITE_URL}/shop\n`, url, 404);
  }

  const [categories, faq, related, reviewStats] = await Promise.all([
    getCategoriesCached(),
    getProductFaqCached(product.sku),
    product.category_slug
      ? getRelatedProductsCached(product.category_slug, product.sku, 5)
      : Promise.resolve([]),
    getReviewStatsCached(),
  ]);

  const cat = categories.find(c => c.slug === product.category_slug) ?? null;
  const parent = cat?.parent_slug ? categories.find(c => c.slug === cat.parent_slug) ?? null : null;
  const rating = reviewStats[product.sku] ?? null;

  const input: MdProductInput = {
    sku: product.sku,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    volume: product.volume,
    description: product.description,
    description_full: product.description_full,
    updated_at: product.updated_at ?? null,
    // Роздрібні поля й тільки вони: у ProductFull лежить і собівартість, і
    // оптова ціна — у Markdown для ШІ вони не мають потрапити НІКОЛИ.
    stock: product.stock
      ? {
          price_retail: product.stock.price_retail,
          price_retail_old: product.stock.price_retail_old,
          price_promo: product.stock.price_promo,
          stock_status: product.stock.stock_status,
          stock_qty: product.stock.stock_qty,
        }
      : null,
    characteristics: product.characteristics.map(c => ({ label: c.label, value: c.value })),
    category: cat ? { slug: cat.slug, name: cat.name } : null,
    parentCategory: parent ? { slug: parent.slug, name: parent.name } : null,
    faq: faq.map(f => ({ question: f.question, answer: f.answer })),
    rating: rating && rating.count > 0 ? { avg: rating.avg, count: rating.count } : null,
    related: related.map(r => ({
      name: r.name,
      slug: r.slug,
      sku: r.sku,
      price: mdPrice(r.stock
        ? {
            price_retail: r.stock.price_retail,
            price_retail_old: r.stock.price_retail_old,
            price_promo: r.stock.price_promo,
            stock_status: r.stock.stock_status,
            stock_qty: r.stock.stock_qty,
          }
        : null),
    })),
  };

  return md(productMarkdown(input), `${SITE_URL}/product/${product.slug ?? product.sku}`);
}
