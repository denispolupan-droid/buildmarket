import { describe, it, expect } from 'vitest';
import { localizeArticleHtml, sanitizeArticleHtml } from '../lib/sanitize-article';

describe('localizeArticleHtml', () => {
  it('додає /ru до внутрішніх посилань на російській версії', () => {
    const html = '<p>Див. <a href="/product/hermetyk-1-2-kg">герметик</a> і <a href="/shop/akrylovi-germetyky">категорію</a>.</p>';
    expect(localizeArticleHtml(html, 'ru')).toBe(
      '<p>Див. <a href="/ru/product/hermetyk-1-2-kg">герметик</a> і <a href="/ru/shop/akrylovi-germetyky">категорію</a>.</p>',
    );
  });

  it('українську версію не чіпає', () => {
    const html = '<a href="/product/x">x</a>';
    expect(localizeArticleHtml(html, 'uk')).toBe(html);
  });

  it('не дублює префікс, якщо він уже є', () => {
    const html = '<a href="/ru/product/x">x</a><a href="/ru">дім</a>';
    expect(localizeArticleHtml(html, 'ru')).toBe(html);
  });

  it('коренева адреса стає /ru/', () => {
    expect(localizeArticleHtml('<a href="/">дім</a>', 'ru')).toBe('<a href="/ru/">дім</a>');
  });

  it('порожній HTML не ламає', () => {
    expect(localizeArticleHtml('', 'ru')).toBe('');
  });

  it('працює на санітизованому HTML (наш реальний конвеєр)', () => {
    const raw = '<p><a href="/product/x" onclick="evil()">товар</a><img src=x onerror=hack></p>';
    const localized = localizeArticleHtml(sanitizeArticleHtml(raw), 'ru');
    expect(localized).toContain('href="/ru/product/x"');
    expect(localized).not.toContain('onclick');
    expect(localized).not.toContain('<img');
  });
});
