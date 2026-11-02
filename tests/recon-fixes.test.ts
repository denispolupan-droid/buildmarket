import { describe, it, expect } from 'vitest';
import { findGapLine, npCategoryLabel, renderReconHtml, suggestNovapayCategory, type SaleLine } from '../lib/recon/rules';

describe('НоваПей: категорія за прецедентами', () => {
  const history = [
    { counterparty: 'ФОП РАВЛО ГАННА ВАСИЛІВНА', direction: 'out', category: 'owner' },
    { counterparty: 'фоп  равло ганна василівна', direction: 'out', category: 'owner' },
    { counterparty: 'ТОВ «Термінал Розетка»', direction: 'out', category: 'topup:rozetka' },
    { counterparty: 'ТОВ Термінал Розетка', direction: 'out', category: 'topup:rozetka' },
    { counterparty: 'ФОП Іванов', direction: 'out', category: 'owner' },
    { counterparty: 'ФОП Іванов', direction: 'out', category: 'opex' },
  ];
  it('усі попередні — одна категорія → пропозиція з кількістю (регістр, пробіли, лапки не важать)', () => {
    expect(suggestNovapayCategory({ counterparty: 'ФОП РАВЛО ГАННА ВАСИЛІВНА', direction: 'out' }, history)).toEqual({ category: 'owner', count: 2 });
    expect(suggestNovapayCategory({ counterparty: 'ТОВ "Термінал Розетка"', direction: 'out' }, history)).toEqual({ category: 'topup:rozetka', count: 2 });
  });
  it('різні категорії, новий контрагент, інший напрямок — без пропозиції', () => {
    expect(suggestNovapayCategory({ counterparty: 'ФОП Іванов', direction: 'out' }, history)).toBeNull();
    expect(suggestNovapayCategory({ counterparty: 'EXE.UA', direction: 'out' }, history)).toBeNull();
    expect(suggestNovapayCategory({ counterparty: 'ФОП РАВЛО ГАННА ВАСИЛІВНА', direction: 'in' }, history)).toBeNull();
    expect(suggestNovapayCategory({ counterparty: null, direction: 'out' }, history)).toBeNull();
  });
  it('підписи категорій', () => {
    expect(npCategoryLabel('owner')).toBe('вивід власника');
    expect(npCategoryLabel('supplier:3', 'EXE.UA')).toBe('оплата постачальнику EXE.UA');
  });
});

describe('наложка: недоплата = позиція, якої не було в посилці', () => {
  const line = (sku: string, qty: number, price: number, extra: Partial<SaleLine> = {}): SaleLine =>
    ({ sku, qty, price, cost_price: price * 0.8, supplier_id: 1, fulfillment_type: 'dropship', ...extra });
  // №26101198: 630 = 100 + 2×70 + 250 + 140, НоваПей виплатила 530
  const order = [line('1600-015', 1, 100), line('1205-023', 2, 70), line('2105-015', 1, 250), line('1005-017', 1, 140)];
  it('рівно ціна однієї позиції', () => {
    expect(findGapLine(100, order)).toMatchObject({ line: { sku: '1600-015' }, qty: 1 });
    expect(findGapLine(250, order)).toMatchObject({ line: { sku: '2105-015' }, qty: 1 });
  });
  it('кілька штук однієї позиції', () => {
    expect(findGapLine(70, order)).toMatchObject({ line: { sku: '1205-023' }, qty: 1 });
  });
  it('неоднозначно або не складається — без пропозиції', () => {
    expect(findGapLine(140, order)).toBeNull(); // 2×70 або 1×140
    expect(findGapLine(55, order)).toBeNull();
    expect(findGapLine(0.5, order)).toBeNull();
  });
  it('лише дропшип із собівартістю й постачальником', () => {
    expect(findGapLine(100, [line('X', 1, 100, { fulfillment_type: 'stock' })])).toBeNull();
    expect(findGapLine(100, [line('X', 1, 100, { cost_price: null })])).toBeNull();
  });
});

describe('Telegram: виправлення', () => {
  it('показує пропозиції й посилання на дайджест; оновлення виписки не рахує', () => {
    const html = renderReconHtml([{
      key: 'bank:novapay', area: 'НоваПей', level: 'red', title: 'розходиться', detail: 'd', items: [],
      fixes: [{ id: 'np:1:owner', label: 'Провести як «вивід власника»', detail: '', amount: 1300 }, { id: 'np-refresh', label: 'Оновити', detail: '', amount: null }],
    }], { periodLabel: '02.11.2026', adminUrl: 'https://x/admin' });
    expect(html).toContain('🛠 Провести як «вивід власника»');
    expect(html).toContain('Виправлень чекають підтвердження: 1');
    expect(html).not.toContain('🛠 Оновити');
  });
});
