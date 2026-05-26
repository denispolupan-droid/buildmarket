/**
 * lib/price-checker.ts
 *
 * Fetches competitor prices from Prom.ua (JSON-LD parsing — reliable)
 * and Epicentr (prom-powered search).
 *
 * NOTE: Rozetka blocks all datacenter IPs via Cloudflare — disabled.
 */

import * as cheerio from 'cheerio';

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface MarketPrice {
  source:     'rozetka' | 'prom' | 'epicentr';
  title:      string;
  price:      number;
  url:        string;
  confidence: number;
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
  delta_pct:   number | null;
  status:      'ok' | 'warning' | 'expensive' | 'cheap' | 'not_found';
  checked_at:  string;
}

/* ── Constants ──────────────────────────────────────────────────────────── */

const MIN_CONFIDENCE = 0.30;   // lowered from 0.35 to catch more results
const TIMEOUT_MS     = 12_000;

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
};

/* ── Query building ─────────────────────────────────────────────────────── */

/**
 * Builds a search query from a product name + optional volume.
 * "Aura Fasad — Акрилова фасадна фарба матова, 3,5 кг" → "Aura Fasad 3,5 кг"
 * Falls back to brand + product model words if no em dash.
 */
export function buildSearchQuery(name: string, volume?: string | null): string {
  // Take text before the em dash (—), or the full name if no dash
  const shortName = name.split('—')[0].trim();

  // Strip long parentheticals like (Біла В1) that reduce search quality
  const cleaned = shortName.replace(/\([^)]{0,20}\)/g, '').trim();

  const q = volume ? `${cleaned} ${volume}` : cleaned;
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

/* ── JSON-LD price extractor (reusable) ─────────────────────────────────── */

interface JsonLdProduct {
  '@type': string;
  name?: string;
  url?: string;
  offers?: {
    '@type'?: string;
    price?: string | number;
    priceCurrency?: string;
    availability?: string;
  };
}

function extractJsonLdPrices(html: string, query: string, source: MarketPrice['source']): MarketPrice[] {
  const $ = cheerio.load(html);
  const prices: MarketPrice[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html() ?? '';
      const data = JSON.parse(raw) as JsonLdProduct | JsonLdProduct[];

      // Handle both single Product and arrays
      const items: JsonLdProduct[] = Array.isArray(data) ? data : [data];

      for (const item of items) {
        if (item['@type'] !== 'Product') continue;
        if (!item.offers?.price || !item.name) continue;

        const price = parseFloat(String(item.offers.price));
        if (!price || price <= 0) continue;

        // Skip out-of-stock
        const avail = item.offers.availability ?? '';
        if (avail.toLowerCase().includes('outofstock')) continue;

        const title = item.name;
        const confidence = calcConfidence(query, title);
        if (confidence < MIN_CONFIDENCE) continue;

        prices.push({
          source,
          title,
          price,
          url: item.url ?? '',
          confidence,
        });
      }
    } catch {
      // skip malformed JSON-LD
    }
  });

  return prices.sort((a, b) => a.price - b.price).slice(0, 10);
}

/* ── Prom.ua ────────────────────────────────────────────────────────────── */

export async function searchProm(query: string): Promise<MarketPrice[]> {
  const url = `https://prom.ua/ua/search?search_term=${encodeURIComponent(query)}`;

  try {
    const resp = await fetch(url, {
      headers: {
        ...BROWSER_HEADERS,
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!resp.ok) return [];

    const html = await resp.text();

    if (
      html.includes('cf-browser-verification') ||
      html.includes('Just a moment') ||
      html.includes('Checking your browser')
    ) {
      console.warn('[prom] Cloudflare challenge detected');
      return [];
    }

    return extractJsonLdPrices(html, query, 'prom');
  } catch (e) {
    console.warn('[prom] fetch error:', e);
    return [];
  }
}

/* ── Epicentr (uses prom-powered search) ───────────────────────────────── */

export async function searchEpicentr(query: string): Promise<MarketPrice[]> {
  const url = `https://epicentrk.ua/search/?search_term=${encodeURIComponent(query)}`;

  try {
    const resp = await fetch(url, {
      headers: {
        ...BROWSER_HEADERS,
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!resp.ok) return [];

    const html = await resp.text();

    if (html.includes('cf-browser-verification') || html.includes('Just a moment')) {
      return [];
    }

    return extractJsonLdPrices(html, query, 'epicentr');
  } catch {
    return [];
  }
}

/* ── Rozetka — DISABLED (Cloudflare blocks all datacenter IPs) ──────────── */

export async function searchRozetka(_query: string): Promise<MarketPrice[]> {
  // Rozetka returns 403 for all server/datacenter IPs via Cloudflare.
  // Cannot be scraped from Vercel. Returning empty.
  return [];
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

  const [promResults, epicentrResults] = await Promise.allSettled([
    searchProm(query),
    searchEpicentr(query),
  ]);

  const prom:     MarketPrice[] = promResults.status     === 'fulfilled' ? promResults.value     : [];
  const epicentr: MarketPrice[] = epicentrResults.status === 'fulfilled' ? epicentrResults.value : [];
  const rozetka:  MarketPrice[] = [];  // disabled

  const allResults = [...prom, ...epicentr];

  const qualifiedPrices = allResults
    .filter(r => r.confidence >= MIN_CONFIDENCE)
    .map(r => r.price);

  const rozetkaMin = rozetka.length > 0 ? Math.min(...rozetka.map(r => r.price)) : null;
  const promMin    = [...prom, ...epicentr].length > 0
    ? Math.min(...[...prom, ...epicentr].map(r => r.price))
    : null;
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
