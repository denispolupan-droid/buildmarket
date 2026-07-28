import sanitizeHtml from 'sanitize-html';

// Дозволені теги в тілі статті блогу. Контент рендериться через
// dangerouslySetInnerHTML, тому санітизація — обов'язкова межа безпеки.
// Раніше тут був regex-«allowlist», який обходився тегами без лапок
// (<img src=x onerror=...>) та protocol-relative href (//evil.com).
// Тепер — справжній HTML-парсер (sanitize-html) з allowlist на рівні DOM.
const ALLOWED_TAGS = ['p', 'h2', 'h3', 'ul', 'ol', 'li', 'table', 'thead',
                      'tbody', 'tr', 'th', 'td', 'strong', 'em', 'a', 'br'];

/**
 * Внутрішні посилання в тілі статті на /ru — з мовним префіксом.
 *
 * Тіло статті зберігається в БД одне для обох мов (перекладається лише текст),
 * тож href-и в ньому мовно-нейтральні: /product/..., /shop/... . Шаблон статті
 * додає /ru до хлібних крихт, CTA і related, але тіло вставляється через
 * dangerouslySetInnerHTML як є — і російський читач з тексту статті потрапляв на
 * УКРАЇНСЬКУ картку товару. Тут дописуємо префікс на рендері (в БД не чіпаємо,
 * щоб укр-версія лишалась чистою).
 */
export function localizeArticleHtml(html: string, lang: 'uk' | 'ru'): string {
  if (lang !== 'ru' || !html) return html;
  // Лише root-relative href-и, які ще не /ru (protocol-relative і зовнішні
  // вирізає санітайзер, тому тут вони не зустрічаються).
  return html.replace(/href="\/(?!ru\/|ru")/g, 'href="/ru/');
}

export function sanitizeArticleHtml(html: string): string {
  if (!html) return '';
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href'] },
    allowedSchemes: [],                 // жодних http:/https:/javascript: у href
    disallowedTagsMode: 'discard',
    transformTags: {
      // залишаємо тільки внутрішні посилання (/product, /shop, /blog…),
      // відкидаємо зовнішні, protocol-relative (//host) та javascript:
      a: (tagName, attribs) => {
        const href = attribs.href ?? '';
        const internal = href.startsWith('/') && !href.startsWith('//');
        const out: Record<string, string> = internal ? { href } : {};
        return { tagName: 'a', attribs: out };
      },
    },
  });
}
