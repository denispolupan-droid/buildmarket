import { describe, it, expect } from 'vitest';
import { parseSmartDate, isoToDisplay } from '../app/components/SmartDateInput';

const now = new Date();
const yyyy = now.getFullYear();
const mm = String(now.getMonth() + 1).padStart(2, '0');

describe('parseSmartDate — швидкий ввід дати в журналі замовлень', () => {
  it('лише день → поточний місяць і рік («05» + Enter)', () => {
    expect(parseSmartDate('05')).toBe(`${yyyy}-${mm}-05`);
    expect(parseSmartDate('5')).toBe(`${yyyy}-${mm}-05`);
    expect(parseSmartDate('05.')).toBe(`${yyyy}-${mm}-05`);
  });

  it('день і місяць → поточний рік («0509» після автоформату — «05.09»)', () => {
    expect(parseSmartDate('05.09')).toBe(`${yyyy}-09-05`);
    expect(parseSmartDate('05.09.')).toBe(`${yyyy}-09-05`);
  });

  it('повна дата, дво- і чотиризначний рік', () => {
    expect(parseSmartDate('05.09.26')).toBe('2026-09-05');
    expect(parseSmartDate('05.09.2026')).toBe('2026-09-05');
    expect(parseSmartDate('2026-09-05')).toBe('2026-09-05');
  });

  it('сміття — null, порожнє — порожній рядок', () => {
    expect(parseSmartDate('32')).toBeNull();
    expect(parseSmartDate('05.13')).toBeNull();
    expect(parseSmartDate('abc')).toBeNull();
    expect(parseSmartDate('')).toBe('');
  });

  it('isoToDisplay — дд.мм.рррр', () => {
    expect(isoToDisplay('2026-09-05')).toBe('05.09.2026');
    expect(isoToDisplay('')).toBe('');
  });
});
