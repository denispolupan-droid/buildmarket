import { describe, it, expect } from 'vitest';
import { buildPromComment } from '../lib/prom-api';

// Коментар покупця Prom приходить у client_notes (не в comment — перевірено на
// живому замовленні 421136171), плюс окремий прапорець «не передзвонювати».

describe('buildPromComment', () => {
  it('бере нотатку покупця з client_notes', () => {
    expect(buildPromComment({ comment: null, client_notes: 'Вітаю 🌞\nВідправляйте одразу.' }))
      .toBe('Вітаю 🌞\nВідправляйте одразу.');
  });

  it('падає назад на comment, коли client_notes немає', () => {
    expect(buildPromComment({ comment: 'текст із comment', client_notes: null }))
      .toBe('текст із comment');
  });

  it('прапорець «не передзвонювати» — фразою, яку розуміє журнал', () => {
    expect(buildPromComment({ comment: null, client_notes: null, dont_call_customer_back: true }))
      .toBe('Не передзвонювати');
    expect(buildPromComment({ comment: null, client_notes: 'Дякую', dont_call_customer_back: true }))
      .toBe('Не передзвонювати. Дякую');
  });

  it('порожньо → null (а не порожній рядок у полі)', () => {
    expect(buildPromComment({ comment: null, client_notes: '  ' })).toBeNull();
    expect(buildPromComment({ comment: null, client_notes: null })).toBeNull();
  });
});
