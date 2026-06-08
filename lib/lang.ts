export type Lang = 'uk' | 'ru';

/** Paths that have a /ru/ mirror */
const RU_PREFIXES = ['/', '/shop', '/product', '/about', '/contacts', '/delivery', '/returns', '/dropship', '/blog', '/catalog', '/login'];

export function getLang(pathname: string): Lang {
  return pathname.startsWith('/ru') ? 'ru' : 'uk';
}

/** /ru/shop/hermetyky → /shop/hermetyky, /shop/hermetyky → /ru/shop/hermetyky */
export function switchLangUrl(pathname: string): string {
  if (pathname.startsWith('/ru')) {
    const without = pathname.slice(3) || '/';
    return without;
  }
  // Check if this path has a Russian version
  const hasRu = RU_PREFIXES.some(p => p === '/' ? pathname === '/' : pathname.startsWith(p));
  if (hasRu) return '/ru' + (pathname === '/' ? '' : pathname);
  return '/ru'; // fallback to Russian home for pages without RU version
}

/** Localize an internal href for the given language */
export function localizeHref(href: string, lang: Lang): string {
  if (lang === 'uk') return href;
  const hasRu = RU_PREFIXES.some(p => p === '/' ? href === '/' : href.startsWith(p));
  if (!hasRu) return href;
  return '/ru' + (href === '/' ? '' : href);
}
