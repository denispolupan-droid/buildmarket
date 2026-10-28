import { describe, it, expect } from 'vitest';
import { classifyAiError, needsOwnerAction, aiOutageMessage, aiFailureShort } from '../lib/ai-health-rules';
import { buildDraftAlertHtml, buildDraftAlertKeyboard, type DraftAlertInput } from '../lib/marketplace-chat-telegram-rules';
import { renderDigestHtml } from '../lib/ops-digest-render';

// 04.10.2026: баланс Anthropic скінчився — чернетки, а з ними й алерти про
// повідомлення покупців мовчки зникли; дайджест прийшов «без моделі» без причини.
describe('classifyAiError', () => {
  it('баланс — з тексту помилки SDK (400 invalid_request_error)', () => {
    const err = Object.assign(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}'), { status: 400 });
    expect(classifyAiError(err)).toBe('billing');
    // і з текстового рядка (автопілот блогу збирає помилки рядками)
    expect(classifyAiError(new Error('topic X: Your credit balance is too low'))).toBe('billing');
  });
  it('ключ, тимчасові, інше', () => {
    expect(classifyAiError(Object.assign(new Error('401 invalid x-api-key'), { status: 401 }))).toBe('auth');
    expect(classifyAiError(Object.assign(new Error('529 Overloaded'), { status: 529 }))).toBe('transient');
    expect(classifyAiError(Object.assign(new Error('rate limited'), { status: 429 }))).toBe('transient');
    expect(classifyAiError(new Error('Покупець написав ще — оновіть чернетку'))).toBe('other');
  });
  it('будимо власника лише через гроші й ключ', () => {
    expect(needsOwnerAction('billing')).toBe(true);
    expect(needsOwnerAction('auth')).toBe(true);
    expect(needsOwnerAction('transient')).toBe(false);
    expect(needsOwnerAction('other')).toBe(false);
  });
  it('повідомлення каже, що зламалось і що робити', () => {
    const m = aiOutageMessage('billing', 'чернетка для чату Rozetka');
    expect(m.title).toContain('Закінчився баланс Anthropic API');
    expect(m.detail).toContain('Plans & Billing');
    expect(m.detail).toContain('без чернетки');
    expect(aiFailureShort('transient')).toContain('перевантажений');
  });
});

const base: DraftAlertInput = {
  mp: 'rozetka', contact: 'Олена', orderNumber: 26101001, lastIncoming: 'Коли відправите?',
  draft: { id: '11111111-2222-4333-8444-555555555555', category: 'other', reply: '', needsHuman: true, reason: null },
  link: 'https://x/admin/chat?tab=mp&chat=rozetka%3A1',
};

describe('алерт без чернетки', () => {
  it('повідомлення покупця є, чернетки й кнопки відправки — немає', () => {
    const i = { ...base, unavailable: 'закінчився баланс Anthropic API' };
    const html = buildDraftAlertHtml(i);
    expect(html).toContain('Коли відправите?');
    expect(html).toContain('Чернетку не підготовлено: закінчився баланс Anthropic API');
    expect(html).not.toContain('Reply');
    expect(buildDraftAlertKeyboard(i).inline_keyboard).toEqual([[{ text: 'Відкрити в адмінці', url: base.link }]]);
  });
});

describe('дайджест без моделі називає причину', () => {
  it('причина в рядку «без моделі»', () => {
    const html = renderDigestHtml({ generatedAt: 'x', dateHuman: 'сьогодні', signals: [] }, null, 'https://x/admin', 'закінчився баланс Anthropic API');
    expect(html).toContain('без моделі — лише перевірки (закінчився баланс Anthropic API)');
  });
});
