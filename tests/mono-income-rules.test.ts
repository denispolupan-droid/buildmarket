import { describe, it, expect } from 'vitest';
import { parseIncomeCategory, incomePartyFor, INCOME_ACCOUNTS, INCOME_CATEGORY_LABEL } from '../lib/mono-income-rules';

describe('надходження-компенсації на Mono (екран «Банк»)', () => {
  it('income:<стаття> розбирається лише для дозволених статей', () => {
    expect(parseIncomeCategory('income:logistics')).toBe('logistics');
    expect(parseIncomeCategory('income:taxes')).toBe('taxes');
    expect(parseIncomeCategory('income:bank')).toBeNull();      // не стаття витрат
    expect(parseIncomeCategory('income:revenue')).toBeNull();
    expect(parseIncomeCategory('logistics')).toBeNull();        // це категорія списання
    expect(parseIncomeCategory('transfer-in:cash')).toBeNull();
    expect(parseIncomeCategory(null)).toBeNull();
  });
  it('компенсація від Нової Пошти / НоваПей — на logistics[np], як і їхні витрати (кейс #26091156)', () => {
    expect(incomePartyFor('logistics', null, 'Відшкодування збитків згідно претензії № 20260930/08263 по ЕН 20451538434110')).toBeNull();
    expect(incomePartyFor('logistics', 'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "НОВА ПОШТА"', 'Відшкодування збитків')).toBe('np');
    expect(incomePartyFor('logistics', 'ТОВ "НоваПей"', null)).toBe('np');
    expect(incomePartyFor('logistics', 'Meest Express', null)).toBeNull();
    expect(incomePartyFor('opex', 'НОВА ПОШТА', null)).toBeNull();
  });
  it('у кожної статті є підпис для екрана', () => {
    for (const a of INCOME_ACCOUNTS) expect(INCOME_CATEGORY_LABEL[a]).toBeTruthy();
  });
});
