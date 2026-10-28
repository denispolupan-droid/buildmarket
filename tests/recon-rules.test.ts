import { describe, it, expect } from 'vitest';
import { balanceFinding, payoutFinding, renderReconHtml, daysBetween, PAYOUT_LAG_DAYS } from '../lib/recon/rules';

const now = new Date('2026-10-28T09:00:00Z');

describe('balanceFinding — динаміка проти минулого запуску', () => {
  const base = { key: 'bank:mono', area: 'Банк Mono', theirsLabel: 'живий залишок' };
  it('зійшлось — зелене', () => {
    expect(balanceFinding({ ...base, ours: 100.4, theirs: 100 }).level).toBe('green');
  });
  it('перший замір розходження — червоне', () => {
    const f = balanceFinding({ ...base, ours: 13183.72, theirs: 5943.92 });
    expect(f.level).toBe('red');
    expect(f.delta).toBe(7239.8);
    expect(f.detail).toContain('перший замір');
  });
  it('те саме розходження тиждень у тиждень — жовте (відоме)', () => {
    const f = balanceFinding({ ...base, ours: 13183.72, theirs: 5943.92, previousDelta: 7239.8 });
    expect(f.level).toBe('yellow');
    expect(f.detail).toContain('без змін');
  });
  it('розходження змінилось — знову червоне з минулим значенням', () => {
    const f = balanceFinding({ ...base, ours: 13183.72, theirs: 5000, previousDelta: 7239.8 });
    expect(f.level).toBe('red');
    expect(f.detail).toContain('минулого разу');
  });
});

describe('payoutFinding — що не закрито довше норми', () => {
  it('враховує норму площадки і «отримано наперед»', () => {
    const f = payoutFinding('np:cod', 'Наложка НоваПей', [
      { orderNumber: 1, net: 452, lastDate: '2026-09-23' },      // 35 дн > 3 — прострочено
      { orderNumber: 2, net: 300, lastDate: '2026-10-27' },      // 1 дн — у нормі
      { orderNumber: 3, net: -500, lastDate: '2026-09-01' },     // наперед > 30 дн
      { orderNumber: 4, net: -200, lastDate: '2026-10-20' },     // наперед, свіже
    ], now);
    expect(f.level).toBe('yellow');
    expect(f.delta).toBe(452);
    expect(f.items.some(i => i.includes('№1') && i.includes('до виплати'))).toBe(true);
    expect(f.items.some(i => i.includes('№3') && i.includes('наперед'))).toBe(true);
    expect(f.items.some(i => i.includes('№2') || i.includes('№4'))).toBe(false);
  });
  it('три й більше прострочені — червоне; порожньо — зелене', () => {
    const items = [1, 2, 3].map(n => ({ orderNumber: n, net: 100, lastDate: '2026-09-01' }));
    expect(payoutFinding('mp:prom', 'Prom', items, now).level).toBe('red');
    expect(payoutFinding('mp:prom', 'Prom', [], now).level).toBe('green');
  });
  it('норми є для всіх службових контрагентів', () => {
    for (const k of ['np:cod', 'mp:rozetka', 'mp:prom', 'mp:epicentr']) expect(PAYOUT_LAG_DAYS[k]).toBeGreaterThan(0);
    expect(daysBetween('2026-10-27', now)).toBe(0);
  });
});

describe('renderReconHtml', () => {
  it('спершу червоне, зелене без деталей, текст екранований', () => {
    const html = renderReconHtml([
      { key: 'a', area: 'Банк <Mono>', level: 'green', title: 'зійшлось', detail: 'деталь', items: [] },
      { key: 'b', area: 'Rozetka', level: 'red', title: 'розходиться на 5 ₴', detail: 'облік & кабінет', items: ['№1'] },
    ], { periodLabel: '28.10.2026', adminUrl: 'https://x/admin' });
    expect(html.indexOf('Rozetka')).toBeLessThan(html.indexOf('Банк &lt;Mono&gt;'));
    expect(html).toContain('облік &amp; кабінет');
    expect(html).not.toContain('деталь');
    expect(html).toContain('Нових або зрослих розходжень: 1');
  });
});
