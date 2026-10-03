import { describe, it, expect } from 'vitest';
import {
  awaitingOurReply, buildTranscript, draftOutcome, findPolicyViolations, lastIncomingAt,
} from '../lib/marketplace-chat-draft-rules';
import { htmlToText } from '../lib/html-to-text';
import type { MarketplaceChatMessage } from '../lib/marketplace-chat-thread';

const msg = (p: Partial<MarketplaceChatMessage>): MarketplaceChatMessage =>
  ({ body: 'текст', at: '2026-09-30 10:00:00', fromUs: false, author: 'Іван', ...p });

// Ключ кешу — час останнього повідомлення ПОКУПЦЯ: наші відповіді й сервісні
// повідомлення Rozetka чернетку не інвалідовують.
describe('lastIncomingAt', () => {
  it('бере найпізніше повідомлення покупця, ігноруючи наші й системні', () => {
    const t = [
      msg({ at: '2026-09-30 09:00:00' }),
      msg({ at: '2026-09-30 09:30:00', fromUs: true, author: 'Ми' }),
      msg({ at: '2026-09-30 09:45:00', author: 'Система' }),
      msg({ at: '2026-09-30 09:20:00' }),
    ];
    expect(lastIncomingAt(t)).toBe('2026-09-30 09:20:00');
  });
  it('без повідомлень покупця — null', () => {
    expect(lastIncomingAt([msg({ fromUs: true })])).toBeNull();
  });
});

describe('awaitingOurReply', () => {
  it('останнє змістовне повідомлення покупця → чекає відповіді', () => {
    expect(awaitingOurReply([msg({ fromUs: true }), msg({})])).toBe(true);
  });
  it('ми відповіли останніми → нічого готувати', () => {
    expect(awaitingOurReply([msg({}), msg({ fromUs: true })])).toBe(false);
  });
  it('системне повідомлення Rozetka після нашої відповіді не рахується', () => {
    expect(awaitingOurReply([msg({}), msg({ fromUs: true }), msg({ author: 'Система', body: '<b>Статус змінено</b>' })])).toBe(false);
  });
  it('порожні повідомлення (лише теги) пропускаються', () => {
    expect(awaitingOurReply([msg({}), msg({ fromUs: true }), msg({ body: '<br>' })])).toBe(false);
  });
});

describe('buildTranscript', () => {
  it('прибирає HTML і підписує сторони', () => {
    const t = buildTranscript([
      msg({ body: 'Доброго дня,<br>коли відправите?' }),
      msg({ body: 'Сьогодні', fromUs: true, author: 'Ми', at: '2026-09-30 10:05:00' }),
    ]);
    expect(t).toContain('ПОКУПЕЦЬ (Іван):\nДоброго дня,\nколи відправите?');
    expect(t).toContain('МИ (магазин):\nСьогодні');
    expect(t).not.toContain('<br>');
  });
});

// Площадки штрафують за виведення покупця з платформи — це страховка поверх промпта.
describe('findPolicyViolations', () => {
  it('ловить телефон, посилання, месенджер, email', () => {
    expect(findPolicyViolations('Телефонуйте +38 (099) 199-77-88')).toContain('телефон');
    expect(findPolicyViolations('дзвоніть 0991997788')).toContain('телефон');
    expect(findPolicyViolations('Дивіться на fixline.com.ua/product/1')).toContain('посилання');
    expect(findPolicyViolations('Напишіть у Viber')).toContain('месенджер');
    expect(findPolicyViolations('info@fixline.com.ua')).toContain('email');
  });
  it('чиста відповідь — без зауважень', () => {
    expect(findPolicyViolations('Так, є в наявності, відправимо сьогодні. ТТН 20450000000001, 2 шт.')).toEqual([]);
  });
});

describe('draftOutcome', () => {
  it('пробіли й переноси не вважаються правкою', () => {
    expect(draftOutcome('Так,  є.\nВідправимо', 'Так, є. Відправимо ')).toBe('sent_as_is');
  });
  it('зміна тексту — edited', () => {
    expect(draftOutcome('Так, є.', 'Ні, немає.')).toBe('edited');
  });
});

describe('htmlToText', () => {
  it('переноси, теги й сутності', () => {
    expect(htmlToText('<p>Привіт&nbsp;<b>світ</b></p><br>&amp; ще')).toBe('Привіт світ\n\n& ще');
  });
});
