import { describe, it, expect } from 'vitest';
import { diffModeration, buildWatchAlert } from '../lib/rozetka-moderation-watch';
import type { ContentSummary, ContentProblem } from '../lib/rozetka-content';

const problem = (over: Partial<ContentProblem>): ContentProblem => ({
  sku: 'A', name: 'Товар A', url: null, reasons: [], kinds: [],
  changeStatus: null, changeDate: null, pending: false, autoFixable: false, ...over,
});

const summary = (problems: ContentProblem[], pending = 0): ContentSummary => ({
  pending, rejected: problems.filter(p => (p.changeStatus ?? '').includes('Відхилено')).length,
  byField: {}, byReason: [], problems, checkedAt: '2026-08-11T07:30:00Z',
});

// Сторож існує заради одного: не проґавити відмову. Але якщо він писатиме про те
// саме щодня — його перестануть читати, і він знову проґавить. Обидві властивості
// і перевіряємо.
describe('diffModeration', () => {
  it('нова відмова помічена', () => {
    const d = diffModeration(
      summary([problem({ sku: 'A', reasons: ['Фото не відповідає вимогам'], changeStatus: 'Відхилено' })]),
      [{ sku: 'A', change_status: 'Очікує підтвердження', reasons: [] }],
    );
    expect(d.newlyRejected).toHaveLength(1);
    expect(d.newlyRejected[0].kinds).toEqual(['photo']);
  });

  it('та сама відмова вдруге — мовчимо', () => {
    const d = diffModeration(
      summary([problem({ sku: 'A', reasons: ['Фото не відповідає вимогам'], changeStatus: 'Відхилено' })]),
      [{ sku: 'A', change_status: 'Відхилено', reasons: ['Фото не відповідає вимогам'] }],
    );
    expect(d.newlyRejected).toHaveLength(0);
  });

  it('додалася НОВА причина по тій самій позиції — це подія', () => {
    // Саме той випадок, коли наше виправлення не спрацювало: мовчати не можна.
    const d = diffModeration(
      summary([problem({
        sku: 'A', changeStatus: 'Відхилено',
        reasons: ['Фото не відповідає вимогам', 'Заборонено використання стоп-слiв на сайтi Rozetka'],
      })]),
      [{ sku: 'A', change_status: 'Відхилено', reasons: ['Фото не відповідає вимогам'] }],
    );
    expect(d.newlyRejected).toHaveLength(1);
    expect(d.newlyRejected[0].reasons).toEqual(['Заборонено використання стоп-слiв на сайтi Rozetka']);
  });

  it('заявка ще в черзі — не привід писати', () => {
    const d = diffModeration(
      summary([problem({ sku: 'A', reasons: ['Посилання/згадка стороннього ресурсу в текстовому описі'], changeStatus: 'Очікує підтвердження', pending: true })], 1),
      [{ sku: 'A', change_status: 'Очікує підтвердження', reasons: ['Посилання/згадка стороннього ресурсу в текстовому описі'] }],
    );
    expect(d.newlyRejected).toHaveLength(0);
    expect(d.stillPending).toBe(1);
  });

  it('позиція зникла зі списку проблем — правку прийняли', () => {
    const d = diffModeration(
      summary([]),
      [{ sku: 'A', change_status: 'Очікує підтвердження', reasons: [] }],
    );
    expect(d.approved).toEqual(['A']);
    expect(d.next).toEqual([]);
  });
});

describe('buildWatchAlert', () => {
  it('без нових відмов текст порожній — алерт не піде', () => {
    expect(buildWatchAlert({ newlyRejected: [], approved: ['A'], stillPending: 5, next: [] }, 'https://x.ua')).toBe('');
  });

  it('групує за типом і веде в розділ', () => {
    const text = buildWatchAlert({
      newlyRejected: [
        { sku: 'A', reasons: ['Фото не відповідає вимогам'], kinds: ['photo'] },
        { sku: 'B', reasons: ['Заборонено використання стоп-слiв'], kinds: ['text'] },
        { sku: 'C', reasons: ['Заборонено використання стоп-слiв'], kinds: ['text'] },
      ],
      approved: ['D'], stillPending: 42, next: [],
    }, 'https://fixline.com.ua');
    expect(text).toContain('3 нових відмов модерації');
    expect(text).toContain('текст (лікується кнопкою) — 2');
    expect(text).toContain('фото (потрібне інше зображення) — 1');
    expect(text).toContain('Ще на модерації: 42');
    expect(text).toContain('https://fixline.com.ua/admin/rozetka/moderation');
  });
});
