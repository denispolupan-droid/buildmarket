import { brandSlug as brandToSlug } from './seo/slug';

export type BrandTile = {
  name: string;
  logo: string | null;
  href: string;
  color: string;
  style: Record<string, string | number>;
};

// Merges the hand-curated BRANDS list below with brands an admin opted into the
// homepage/About page via the "Логотипи брендів" modal's "показувати на головній"
// checkbox (see BrandLogosModal + brand_logos.show_on_home). DB brands already present
// in BRANDS are skipped — the static entry (with its own color/style) wins.
//
// activeBrands — бренди, у яких зараз є активні товари (getBrandsCached). Плитка
// веде на /shop/brand/<slug>, а та сторінка знає лише такі бренди: бренд із
// логотипом, але без жодного активного товару (Bostik — 6 товарів, усі
// вимкнені) давав 404 просто з головної. Без списку фільтр не застосовується.
export function mergeVisibleBrands(
  dbBrands: { name: string; logoUrl: string }[],
  activeBrands?: string[],
): BrandTile[] {
  const staticNames = new Set(BRANDS.map(b => b.name.toUpperCase()));
  const extra: BrandTile[] = dbBrands
    .filter(b => !staticNames.has(b.name.toUpperCase()))
    .map(b => ({
      name: b.name,
      logo: b.logoUrl,
      href: `/shop/brand/${brandToSlug(b.name)}`,
      color: 'var(--text-primary)',
      style: {},
    }));
  const tiles = [...BRANDS, ...extra];
  if (!activeBrands) return tiles;
  const active = new Set(activeBrands.map(b => b.trim().toUpperCase()));
  return tiles.filter(t => active.has(t.name.trim().toUpperCase()));
}

// Single source of truth for the brand tiles shown on the homepage carousel and the
// About page's brand grid — keeps both pages in sync instead of maintaining two lists.
export const BRANDS: BrandTile[] = [
  { name: 'Ceresit',  logo: '/brands/ceresit.webp',  href: '/shop/brand/ceresit',  color: '#E31E25', style: {} },
  { name: 'Knauf',    logo: null,                     href: '/shop/brand/knauf',    color: '#0066CC',
    style: { fontWeight: 900, fontSize: '22px', letterSpacing: '-0.5px', fontFamily: 'Arial Black, sans-serif' } },
  { name: 'Lacrysil', logo: '/brands/Lacrysil.png',  href: '/shop/brand/lacrysil', color: '#1E7B3E', style: {} },
  { name: 'POLIFARB', logo: null,                     href: '/shop/brand/polifarb', color: '#D10000',
    style: { fontWeight: 900, fontSize: '17px', letterSpacing: '0.04em' } },
  { name: 'ESKARO',   logo: null,                     href: '/shop/brand/eskaro',   color: '#004EA2',
    style: { fontWeight: 900, fontSize: '20px', letterSpacing: '0.06em' } },
  { name: 'Pattex',   logo: '/brands/pattex.webp',   href: '/shop/brand/pattex',   color: '#E20025', style: {} },
  { name: 'AURA',     logo: null,                     href: '/shop/brand/aura',     color: '#0072CE',
    style: { fontWeight: 900, fontSize: '26px', letterSpacing: '-1px', fontStyle: 'italic' } },
  { name: 'Ataman',   logo: '/brands/ataman.jpg',     href: '/shop/brand/ataman',   color: '#8B1A1A', style: {} },
  { name: 'Bitugum',  logo: '/brands/bitugum.webp',   href: '/shop/brand/bitugum',  color: '#1A1A1A', style: {} },
];
