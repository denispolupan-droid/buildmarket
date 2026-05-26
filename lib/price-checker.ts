/**
 * lib/price-checker.ts
 *
 * Fetches competitor prices from Rozetka (JSON API) and Prom.ua (HTML scraping)
 * for a given product, calculates market min/avg and comparison status.
 */

import * as cheerio from 'cheerio';

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface MarketPrice {
  source:     'rozetka' | 'prom';
  title:      string;
  price:      number;
  url:        string;
  confidence: number;  // 0–1, how likely this is the right product
}

export interface PriceCheckResult {
  sku:         string;
  our_price:   number | null;
  results:     MarketPrice[];
  rozetka_min: number | null;
  prom_min:    number | null;
  market_min:  number | null;
  market_avg:  number | null;
  match_count: number;
  delta_pct:   number | null;   // (our - min) / min * 100
  status:      'ok' | 'warning' | 'expensive' | 'cheap' | 'not_found';
  checked_at:  string;
}

/* ── Constants ──────────────────────────────────────────────────────────── */

const MIN_CONFIDENCE = 0.35;
const TIMEOUT_MS     = 12_000;

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
};

/* ── Query building ─────────────────────────────────────────────────────── */

/**
 * Builds a search query from a product name + volume.
 * "Aura Fasad — Акрилова фасадна фарба матова, 3,5 кг"  →  "Aura Fasad 3,5 кг"
 */
export function buildSearchQuery(name: string, volume?: string | null): string {
  // Take the short product name before the em dash
  const shortName = name.split('—')[0].trim();
  const q = volume ? `${shortName} ${volume}` : shortName;
  return q.replace(/\s+/g, ' ').trim();
}

/* ── Confidence scoring ─────────────────────────────────────────────────── */

function normalizeTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\wа-яёіїєґ\d,\.]/gi, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

export function calcConfidence(query: string, resultTitle: string): number {
  const qTokens  = normalizeTokens(query);
  const rtTokens = normalizeTokens(resultTitle);
  if (qTokens.length === 0) return 0;

  let hits = 0;
  for (const qt of qTokens) {
    if (rtTokens.some(rt => rt.includes(qt) || qt.includes(rt))) hits++;
  }
  return hits / qTokens.length;
}

/* ── Rozetka (JSON API) ─────────────────────────────────────────────────── */

export async function searchRozetka(query: string): Promise<MarketPrice[]> {
  // Try two known Rozetka catalog endpoints
  const endpoints = [
    `https://xl-catalog-api.rozetka.com.ua/v4/goods/get?front-type=xl&country=UA&lang=ua&search=${encodeURIComponent(query)}&page=1&per_page=12`,
    `https://search.rozetka.com.ua/ua/api/v6/goods/?text=${encodeURIComponent(query)}&lang=ua&page=1&per_page=12`,
  ];

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        headers: { ...BROWSER_HEADERS, Accept: 'application/json' },
        signal:  AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!resp.ok) continue;

      const json = await resp.json() as Record<string, unknown>;

      // Shape varies slightly per endpoint
      const goods: unknown[] =
        (json?.data as Record<string, unknown>)?.goods as unknown[] ??
        (json?.data as Record<string, unknown>)?.items  as unknown[] ??
        (json?.results as unknown[]) ??
        [];

      const prices: MarketPrice[] = [];

      for (const g of goods as Record<string, unknown>[]) {
        const price = Number(g.price ?? g.sell_price ?? 0);
        const title = String(g.title ?? g.name ?? '');
        if (!price || !title) continue;

        const confidence = calcConfidence(query, title);
        if (confidence < MIN_CONFIDENCE) continue;

        prices.push({
          source:     'rozetka',
          title,
          price,
          url:        String(g.href ?? g.url ?? `https://rozetka.com.ua/${g.id ?? ''}`),
          confidence,
        });
      }

      if (prices.length > 0) return prices.sort((a, b) => a.price - b.price).slice(0, 8);
    } catch {
      // try next endpoint
    }
  }

  return [];
}

/* ── Prom.ua (HTML scraping) ────────────────────────────────────────────── */

export async function searchProm(query: string): Promise<MarketPrice[]> {
  const url = `https://prom.ua/ua/search?search_term=${encodeURIComponent(query)}`;

  try {
    const resp = await fetch(url, {
      headers: { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml' },
      signal:  AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!resp.ok) return [];

    const html = await resp.text();

    // Detect Cloudflare challenge
    if (
      html.includes('cf-browser-verification') ||
      html.includes('Just a moment') ||
      html.includes('Checking your browser')
    ) {
      console.warn('[prom] Cloudflare challenge detected');
      return [];
    }

    const $ = cheerio.load(html);
    const prices: MarketPrice[] = [];

    // Prom product cards — try several possible selectors
    const cardSelectors = [
      '[data-product-id]',
      '[class*="product-item"]',
      '[class*="goods-tile"]',
    ];

    for (const sel of cardSelectors) {
      if ($(sel).length === 0) continue;

      $(sel).each((_, el) => {
        const title =
          $(el).find('[class*="product-name"], [class*="caption__name"], a[class*="name"]').first().text().trim() ||
          $(el).find('a[title]').attr('title')?.trim() ||
          '';

        const priceRaw =
          $(el).find('[class*="price_num"], [class*="price-value"], [class*="price__value"]').first().text().trim() ||
          $(el).find('[class*="price"]').first().text().trim();

        const href =
          $(el).find('a[href*="/p"]').first().attr('href') ||
          $(el).find('a').first().attr('href') || '';

        const priceNum = Number(priceRaw.replace(/\s/g, '').replace(',', '.').match(/[\d.]+/)?.[0] ?? '0');
        if (!priceNum || !title) return;

        const confidence = calcConfidence(query, title);
        if (confidence < MIN_CONFIDENCE) return;

        prices.push({
          source:     'prom',
          title,
          price:      priceNum,
          url:        href.startsWith('http') ? href : `https://prom.ua${href}`,
          confidence,
        });
      });

      if (prices.length > 0) break;
    }

    return prices.sort((a, b) => a.price - b.price).slice(0, 8);
  } catch {
    return [];
  }
}

/* ── Status calculation ─────────────────────────────────────────────────── */

function calcStatus(
  ourPrice: number | null,
  marketMin: number | null,
): PriceCheckResult['status'] {
  if (!marketMin) return 'not_found';
  if (!ourPrice)  return 'not_found';
  const ratio = ourPrice / marketMin;
  if (ratio > 1.15) return 'expensive';
  if (ratio > 1.05) return 'warning';
  if (ratio < 0.90) return 'cheap';
  return 'ok';
}

/* ── Public: check one product ──────────────────────────────────────────── */

export async function checkProductPrices(product: {
  sku:    string;
  name:   string;
  volume: string | null;
  price:  number | null;
}): Promise<PriceCheckResult> {
  const query = buildSearchQuery(product.name, product.volume);

  const [rozetkaResults, promResults] = await Promise.allSettled([
    searchRozetka(query),
    searchProm(query),
  ]);

  const rozetka: MarketPrice[] = rozetkaResults.status === 'fulfilled' ? rozetkaResults.value : [];
  const prom:    MarketPrice[] = promResults.status    === 'fulfilled' ? promResults.value    : [];

  const allResults = [...rozetka, ...prom];

  const qualifiedPrices = allResults
    .filter(r => r.confidence >= MIN_CONFIDENCE)
    .map(r => r.price);

  const rozetkaMin = rozetka.length > 0 ? Math.min(...rozetka.map(r => r.price)) : null;
  const promMin    = prom.length    > 0 ? Math.min(...prom.map(r => r.price))    : null;
  const marketMin  = qualifiedPrices.length > 0 ? Math.min(...qualifiedPrices) : null;
  const marketAvg  = qualifiedPrices.length > 0
    ? Math.round(qualifiedPrices.reduce((a, b) => a + b, 0) / qualifiedPrices.length)
    : null;

  const deltaPct = marketMin && product.price
    ? Math.round((product.price - marketMin) / marketMin * 100)
    : null;

  return {
    sku:         product.sku,
    our_price:   product.price,
    results:     allResults.sort((a, b) => b.confidence - a.confidence),
    rozetka_min: rozetkaMin,
    prom_min:    promMin,
    market_min:  marketMin,
    market_avg:  marketAvg,
    match_count: qualifiedPrices.length,
    delta_pct:   deltaPct,
    status:      calcStatus(product.price, marketMin),
    checked_at:  new Date().toISOString(),
  };
}
