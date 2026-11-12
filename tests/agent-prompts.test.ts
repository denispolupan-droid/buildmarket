import { describe, it, expect, vi } from 'vitest';

// Модулі агентів створюють клієнтів на імпорті — у тесті вони не потрібні
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: vi.fn() }; } }));

import { buildUaPrompt, fitShortDescription } from '../lib/product-content-gen';
import { buildMpPrompt, mpTextProblem } from '../lib/marketplace-description-gen';
import { mpDescription } from '../lib/marketplace-description';
import {
  SHORT_DESC_MAX, FULL_DESC_MIN_CHARS, MP_DESC_MIN, MP_DESC_MAX, MP_TARGETS, FILLER_WORDS, isWastedKeyword,
} from '../lib/content-rules';
import { EPICENTR_DESC_MAX } from '../lib/epicentr-content';
import { DESC_MAX } from '../lib/seo/snippets';

/**
 * Промпти агентів не мають суперечити правилам, які перевіряють фіди й SEO
 * (аудит 12.11.2026: промпт вимагав «150–220 символів», «якісний продукт»,
 * «купити … Київ» і знав лише Rozetka/Prom). Правила — у lib/content-rules;
 * промпт будується з них, а тут перевіряємо, що так і лишилось.
 */

const product = { sku: 'T-1', name: 'Ceresit CS 25 Силіконовий герметик, 280 мл', brand: 'Ceresit', volume: '280 мл' };
const labels = { required: ['Колір'], optional: [], facets: [] };

describe('агент текстів товару (product-content-gen)', () => {
  const prompt = buildUaPrompt(product as never, 'Герметики', labels as never);
  it('межі довжини — з правил, а не прозою', () => {
    expect(SHORT_DESC_MAX).toBe(DESC_MAX);
    expect(prompt).toContain(`ДО ${SHORT_DESC_MAX} символів`);
    expect(prompt).toContain(`${FULL_DESC_MIN_CHARS} знаків`);
    expect(prompt).not.toMatch(/150-220/);
  });
  it('не вимагає «води» й комерційних keywords', () => {
    // Слова-«вода» можуть стояти лише в забороні «Без/не вживай …», не як вимога тексту
    expect(prompt.replace(/«[^»]*»/g, '')).not.toMatch(/якісн|надійн/i);
    expect(prompt).not.toMatch(/"купити \[назва\]"|\[назва\] оптом|\[назва\] Київ/);
  });
  it('короткий опис обрізається до межі й чиститься від «води»', () => {
    const long = 'Якісний силіконовий герметик Ceresit CS 25 для ванної. '.repeat(5);
    const out = fitShortDescription(long);
    expect(out.length).toBeLessThanOrEqual(SHORT_DESC_MAX);
    expect(out).not.toMatch(/якісн/i);
  });
  it('keywords: комерційні слова й міста — марні', () => {
    expect(isWastedKeyword('купити герметик')).toBe(true);
    expect(isWastedKeyword('герметик київ')).toBe(true);
    expect(isWastedKeyword('герметик для ванної')).toBe(false);
  });
});

describe('агент опису для маркетплейсів (marketplace-description-gen)', () => {
  const prompt = buildMpPrompt(product, 'Герметики');
  it('знає всі площадки з довідника каналів (включно з Епіцентром)', () => {
    expect(MP_TARGETS).toContain('Епіцентр');
    for (const t of MP_TARGETS) expect(prompt).toContain(t);
  });
  it('межі довжини не ширші за ліміт Епіцентру', () => {
    expect(MP_DESC_MAX).toBeLessThanOrEqual(EPICENTR_DESC_MAX);
    expect(prompt).toContain(`${MP_DESC_MIN}–${MP_DESC_MAX}`);
  });
  it('перевірка тексту: магазин, мова, довжина', () => {
    const ok = 'Силіконовий герметик для швів у ванній. '.repeat(20).trim();
    expect(mpTextProblem(ok)).toBeNull();
    expect(mpTextProblem(ok + ' Доставка Новою Поштою.')).toMatch(/магазин|доставк/);
    expect(mpTextProblem('коротко')).toMatch(/закороткий/);
  });
});

describe('страховка фідів', () => {
  it('без description_mp — опис сайту без абзаців про магазин і доставку', () => {
    const full = 'Герметик для швів.\n\nЗамовити можна з доставкою Новою Поштою.\n\nОформлюйте в інтернет-магазині FIXLINE.';
    expect(mpDescription({ description_mp: '', description_full: full })).toBe('Герметик для швів.');
  });
  it('FILLER_WORDS непорожній — стандарт забороняє «воду»', () => {
    expect(FILLER_WORDS).toContain('якісний');
  });
});
