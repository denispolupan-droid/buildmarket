import { describe, it, expect } from 'vitest';
import { statusAge, humanAge } from '../lib/orders/status-age';

const NOW = new Date('2026-08-20T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

describe('humanAge', () => {
  it('менше години — «щойно»', () => {
    expect(humanAge(59 * 60_000)).toBe('щойно');
  });

  it('години й дні з українською множиною', () => {
    expect(humanAge(3 * 3600_000)).toBe('3 год');
    expect(humanAge(25 * 3600_000)).toBe('1 день');
    expect(humanAge(50 * 3600_000)).toBe('2 дні');
    expect(humanAge(5 * 24 * 3600_000)).toBe('5 днів');
    expect(humanAge(11 * 24 * 3600_000)).toBe('11 днів');
    expect(humanAge(21 * 24 * 3600_000)).toBe('21 день');
  });
});

describe('statusAge', () => {
  it('рахує від останнього переходу в поточний статус', () => {
    const age = statusAge({
      status: 'confirmed',
      created_at: hoursAgo(100),
      status_history: [
        { status: 'new', at: hoursAgo(100) },
        { status: 'confirmed', at: hoursAgo(30) },
      ],
    }, NOW);
    expect(age?.label).toBe('1 день');
  });

  it('без історії бере дату оформлення', () => {
    const age = statusAge({ status: 'new', created_at: hoursAgo(5), status_history: null }, NOW);
    expect(age?.label).toBe('5 год');
    expect(age?.stale).toBe(false);
  });

  it('позначає застояле замовлення за порогом свого статусу', () => {
    expect(statusAge({ status: 'new', created_at: hoursAgo(23), status_history: [] }, NOW)?.stale).toBe(false);
    expect(statusAge({ status: 'new', created_at: hoursAgo(25), status_history: [] }, NOW)?.stale).toBe(true);
    // «Відправлено» живе довше: посилка їде, і три дні — це норма
    expect(statusAge({ status: 'shipped', created_at: hoursAgo(72), status_history: [] }, NOW)?.stale).toBe(false);
  });

  it('для кінцевих статусів віку немає', () => {
    expect(statusAge({ status: 'delivered', created_at: hoursAgo(200), status_history: [] }, NOW)).toBeNull();
    expect(statusAge({ status: 'cancelled', created_at: hoursAgo(200), status_history: [] }, NOW)).toBeNull();
  });

  it('не показує від’ємний вік, якщо дата з майбутнього', () => {
    expect(statusAge({ status: 'new', created_at: hoursAgo(-5), status_history: [] }, NOW)).toBeNull();
  });

  it('битій даті вік не вигадує', () => {
    expect(statusAge({ status: 'new', created_at: 'не дата', status_history: [] }, NOW)).toBeNull();
  });
});
