/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { captureUtm, getStoredUtm, clearUtm } from '../lib/utm';

// gclid відновити заднім числом неможливо: він живе лише в посиланні, за яким
// людина прийшла. Тому саме його збереження і закріплено тестом — тиха втрата
// цього параметра закрила б вивантаження офлайн-конверсій у Google Ads.

function visit(url: string, referrer = '') {
  window.history.replaceState({}, '', url);
  Object.defineProperty(document, 'referrer', { value: referrer, configurable: true });
}

describe('captureUtm', () => {
  beforeEach(() => {
    clearUtm();
    visit('/');
  });

  it('зберігає gclid із рекламного переходу', () => {
    visit('/product/test?gclid=Cj0KCQjw_TEST123');
    captureUtm();
    const d = getStoredUtm();
    expect(d.gclid).toBe('Cj0KCQjw_TEST123');
    // Клік із Google Ads не завжди несе utm_* — без цього він осідав би органікою
    expect(d.utm_source).toBe('google');
    expect(d.utm_medium).toBe('cpc');
  });

  it('явні utm_* не перебиваються, але gclid усе одно зберігається', () => {
    visit('/?utm_source=google&utm_medium=shopping&utm_campaign=merchant&gclid=ABC123');
    captureUtm();
    const d = getStoredUtm();
    expect(d.utm_source).toBe('google');
    expect(d.utm_medium).toBe('shopping');
    expect(d.utm_campaign).toBe('merchant');
    expect(d.gclid).toBe('ABC123');
  });

  it('звичайний перехід без міток не вигадує gclid', () => {
    visit('/', 'https://www.google.com/');
    captureUtm();
    const d = getStoredUtm();
    expect(d.gclid).toBeUndefined();
    expect(d.referrer_url).toBe('https://www.google.com/');
  });
});
