/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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
  afterEach(() => { vi.useRealTimers(); });

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

  // Інцидент 26.09.2026: на другій сторінці (адреса без міток, реферер у SPA
  // все ще google.com) збережений gclid стирався — 0 замовлень із gclid за два
  // місяці реклами.
  it('перехід на наступну сторінку сайту не стирає gclid', () => {
    visit('/product/test?gclid=KEEP_ME', 'https://www.google.com/');
    captureUtm();
    visit('/cart', 'https://www.google.com/');
    captureUtm();
    visit('/', '');
    captureUtm();
    const d = getStoredUtm();
    expect(d.gclid).toBe('KEEP_ME');
    expect(d.utm_source).toBe('google');
  });

  it('другий зовнішній реферер не перебиває збережений рекламний клік', () => {
    visit('/?gclid=FIRST');
    captureUtm();
    visit('/blog/x', 'https://chatgpt.com/');
    captureUtm();
    expect(getStoredUtm().gclid).toBe('FIRST');
  });

  it('новий позначений перехід перебиває старий', () => {
    visit('/?utm_source=telegram&utm_medium=post');
    captureUtm();
    visit('/?gclid=NEW');
    captureUtm();
    const d = getStoredUtm();
    expect(d.gclid).toBe('NEW');
    expect(d.utm_source).toBe('google');
  });

  it('джерело протухає через 90 днів', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    visit('/?gclid=OLD');
    captureUtm();
    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));
    expect(getStoredUtm()).toEqual({});
    // і не заважає записати нове джерело
    visit('/', 'https://www.google.com/');
    captureUtm();
    expect(getStoredUtm().referrer_url).toBe('https://www.google.com/');
  });

  it('у замовлення не витікає службове поле at', () => {
    visit('/?gclid=X');
    captureUtm();
    expect(Object.keys(getStoredUtm())).not.toContain('at');
  });
});
