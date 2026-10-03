/**
 * HTML → простий текст для повідомлень площадок.
 *
 * Rozetka шле body чату як HTML (сервісні повідомлення з <br>, посиланнями,
 * &nbsp;). Один і той самий перетворювач потрібен і в треді адмінки (рендер),
 * і в ШІ-помічнику (транскрипт для моделі) — тому живе тут, а не в компоненті.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
