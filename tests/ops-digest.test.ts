import { describe, it, expect } from 'vitest';
import { kyivDayRange, kyivOffsetMs, kyivYmd } from '../lib/kyiv-date';
import { renderDigestHtml, type DigestData } from '../lib/ops-digest-render';

// Межі доби — за Києвом, незалежно від зони сервера (Vercel — UTC).
describe('kyiv-date', () => {
  it('літо +3, зима +2', () => {
    expect(kyivOffsetMs(new Date('2026-07-15T12:00:00Z'))).toBe(3 * 3_600_000);
    expect(kyivOffsetMs(new Date('2026-01-15T12:00:00Z'))).toBe(2 * 3_600_000);
  });
  it('23:30 UTC — це вже наступна доба за Києвом', () => {
    expect(kyivYmd(new Date('2026-10-03T23:30:00Z'))).toBe('2026-10-04');
  });
  it('учорашня доба в UTC починається о 21:00 попереднього дня (літній час)', () => {
    const r = kyivDayRange(new Date('2026-10-04T04:30:00Z'), -1);
    expect(r.ymd).toBe('2026-10-03');
    expect(r.start.toISOString()).toBe('2026-10-02T21:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-10-03T21:00:00.000Z');
  });
  it('перехід на зимовий час: доба триває 25 годин', () => {
    // 25.10.2026 — остання неділя жовтня, о 04:00 стрілки назад
    const r = kyivDayRange(new Date('2026-10-25T12:00:00Z'), 0);
    expect(r.end.getTime() - r.start.getTime()).toBe(25 * 3_600_000);
  });
});

const data: DigestData = {
  generatedAt: '2026-10-04T04:30:00Z', dateHuman: '04.10.2026, неділя',
  signals: [
    { key: 'ready', title: 'До відправки', level: 'red', summary: '2 понад добу', items: ['№1 — 2 дн', '№2 — 3 дн'] },
    { key: 'ok', title: 'Каталог', level: 'green', summary: 'без ціни: 0', items: [] },
  ],
};

describe('renderDigestHtml', () => {
  it('текст моделі екранується, порядок — за рівнем', () => {
    const html = renderDigestHtml(data, {
      headline: 'Головне: <ЕН> & відправки',
      items: [{ level: 'green', text: 'все ок' }, { level: 'red', text: '№1 третій день' }],
    }, 'https://x/admin');
    expect(html).toContain('Головне: &lt;ЕН&gt; &amp; відправки');
    expect(html.indexOf('🔴 №1')).toBeLessThan(html.indexOf('🟢 все ок'));
    expect(html).toContain('<a href="https://x/admin/chat?tab=mp">');
  });
  it('без моделі — детермінований текст із сигналів', () => {
    const html = renderDigestHtml(data, null, 'https://x/admin');
    expect(html).toContain('без моделі');
    expect(html).toContain('🔴 <b>До відправки</b>: 2 понад добу');
    expect(html).toContain('• №1 — 2 дн');
  });
  it('не перевищує ліміт Telegram', () => {
    const big = { ...data, signals: Array.from({ length: 80 }, (_, i) => ({ key: `k${i}`, title: `Сигнал ${i}`, level: 'yellow' as const, summary: 'x'.repeat(120), items: ['y'.repeat(80)] })) };
    expect(renderDigestHtml(big, null, 'https://x/admin').length).toBeLessThanOrEqual(3900);
  });
});
