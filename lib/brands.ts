// Single source of truth for the brand tiles shown on the homepage carousel and the
// About page's brand grid — keeps both pages in sync instead of maintaining two lists.
export const BRANDS = [
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
] as const;
