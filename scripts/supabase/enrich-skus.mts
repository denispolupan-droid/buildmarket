/**
 * Дозаповнення карток конкретних SKU тим самим рушієм, що й SEO-черга
 * (enrichCatalog): характеристики регенеруються з merge, якщо бракує обов'язкових
 * або значення фасетів поза довідником; опис — лише якщо тонкий.
 *   npx tsx --env-file=.env.local scripts/supabase/enrich-skus.mts 2105-023 2105-024
 */
import * as ns from '../../lib/catalog-enricher';
const { enrichCatalog } = (((ns as Record<string, unknown>).default ?? ns)) as typeof ns;

const skus = process.argv.slice(2);
if (!skus.length) { console.error('вкажи SKU'); process.exit(1); }
for await (const ev of enrichCatalog({ skus })) {
  if (ev.type === 'result') console.log('RESULT', ev.sku, `$${ev.costUsd.toFixed(3)}`, `faq=${ev.faqCount}`, `ru=${ev.ru}`);
  else if (ev.type === 'error') console.log('ERROR', ev.sku, ev.error.slice(0, 800));
  else console.log(ev.type, ev.type === 'progress' ? ev.name : '');
}
