import { describe, it, expect } from 'vitest';
import {
  adminChatLink, buildDraftAlertHtml, buildDraftAlertKeyboard, parseDraftCallback, type DraftAlertInput,
} from '../lib/marketplace-chat-telegram-rules';

const base: DraftAlertInput = {
  mp: 'prom', contact: 'Іван <Петренко>', orderNumber: 26091234,
  lastIncoming: 'Коли відправите? & чи є в наявності',
  draft: { id: '11111111-2222-4333-8444-555555555555', category: 'order_status', reply: 'Відправимо сьогодні, ТТН надішлемо.', needsHuman: false, reason: null },
  link: 'https://x/admin/chat?tab=mp&chat=prom%3Aabc',
};

describe('buildDraftAlertHtml', () => {
  it('екранує все, що прийшло від покупця й моделі, і показує категорію', () => {
    const html = buildDraftAlertHtml(base);
    expect(html).toContain('Іван &lt;Петренко&gt;');
    expect(html).toContain('Коли відправите? &amp; чи є');
    expect(html).toContain('Статус замовлення');
    expect(html).toContain('№26091234');
    expect(html).not.toContain('Потрібна людина');
  });
  it('needsHuman — попередження з причиною', () => {
    const html = buildDraftAlertHtml({ ...base, draft: { ...base.draft, needsHuman: true, reason: 'повернення' } });
    expect(html).toContain('Потрібна людина</b>: повернення');
  });
  it('довге питання обрізається', () => {
    const html = buildDraftAlertHtml({ ...base, lastIncoming: 'а'.repeat(500) });
    expect(html).toContain('а'.repeat(349) + '…');
  });
});

describe('buildDraftAlertKeyboard', () => {
  it('«Надіслати як є» лише коли людина не потрібна', () => {
    const k1 = buildDraftAlertKeyboard(base);
    expect(k1.inline_keyboard[0].map(b => b.callback_data)).toEqual([`mpd:send:${base.draft.id}`, `mpd:skip:${base.draft.id}`]);
    const k2 = buildDraftAlertKeyboard({ ...base, draft: { ...base.draft, needsHuman: true } });
    expect(k2.inline_keyboard[0].map(b => b.callback_data)).toEqual([`mpd:skip:${base.draft.id}`]);
    expect(k2.inline_keyboard[1][0].url).toBe(base.link);
  });
});

describe('parseDraftCallback', () => {
  it('приймає лише свій префікс, дію і uuid', () => {
    expect(parseDraftCallback(`mpd:send:${base.draft.id}`)).toEqual({ action: 'send', draftId: base.draft.id });
    expect(parseDraftCallback(`mpd:skip:${base.draft.id}`)).toEqual({ action: 'skip', draftId: base.draft.id });
    expect(parseDraftCallback('mpd:send:not-a-uuid')).toBeNull();
    expect(parseDraftCallback('other:send:' + base.draft.id)).toBeNull();
    expect(parseDraftCallback(`mpd:delete:${base.draft.id}`)).toBeNull();
    expect(parseDraftCallback(null)).toBeNull();
  });
});

describe('adminChatLink', () => {
  it('кодує ключ чату', () => {
    expect(adminChatLink('https://x', 'prom', '123_456_buyer')).toBe('https://x/admin/chat?tab=mp&chat=prom%3A123_456_buyer');
  });
});
