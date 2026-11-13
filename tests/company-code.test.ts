import { describe, it, expect } from 'vitest';
import { extractTaxCode, normalizeCompanyCode } from '../lib/company-code';

describe('extractTaxCode — код ЄДРПОУ/ІПН у коментарі покупця', () => {
  it('№26111088: назва в «» і код після неї', () => {
    const hit = extractTaxCode('Здравствуйте. Товар нужен по безналу. Товариство з обмеженою відповідальністю «ОФІС-КОМФОРТ СЕРВІС» 44994768\n⛔ Не передзвонювати для підтвердження');
    expect(hit?.code).toBe('44994768');
    expect(hit?.nameHint).toMatch(/ОФІС-КОМФОРТ СЕРВІС/);
  });
  it('«ЄДРПОУ: …» і ФОП з ІПН', () => {
    expect(extractTaxCode('Рахунок на ТОВ "Ромашка", ЄДРПОУ: 12345678')?.code).toBe('12345678');
    expect(extractTaxCode('ФОП Іваненко І.І. ІПН 3198107136')?.code).toBe('3198107136');
  });
  it('телефони — не код', () => {
    expect(extractTaxCode('+38 (095) 634-80-67')).toBeNull();
    expect(extractTaxCode('Передзвоніть 0956348067')).toBeNull();
    expect(extractTaxCode('380956348067')).toBeNull();
  });
  it('кілька «голих» чисел без ключових слів — не вгадуємо', () => {
    expect(extractTaxCode('12345678 87654321')).toBeNull();
  });
  it('порожньо', () => {
    expect(extractTaxCode('')).toBeNull();
    expect(extractTaxCode(null)).toBeNull();
  });
});

describe('normalizeCompanyCode', () => {
  it('лише 8 або 10 цифр', () => {
    expect(normalizeCompanyCode(' 4499 4768 ')).toBe('44994768');
    expect(normalizeCompanyCode('123')).toBeNull();
  });
});
