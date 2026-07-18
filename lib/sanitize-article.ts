import sanitizeHtml from 'sanitize-html';

// Дозволені теги в тілі статті блогу. Контент рендериться через
// dangerouslySetInnerHTML, тому санітизація — обов'язкова межа безпеки.
// Раніше тут був regex-«allowlist», який обходився тегами без лапок
// (<img src=x onerror=...>) та protocol-relative href (//evil.com).
// Тепер — справжній HTML-парсер (sanitize-html) з allowlist на рівні DOM.
const ALLOWED_TAGS = ['p', 'h2', 'h3', 'ul', 'ol', 'li', 'table', 'thead',
                      'tbody', 'tr', 'th', 'td', 'strong', 'em', 'a', 'br'];

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
