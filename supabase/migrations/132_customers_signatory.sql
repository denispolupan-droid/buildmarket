-- Підписант контрагента (керівник): ПІБ і посада. Підставляються в рядок
-- «Отримав(ла)» видаткової накладної (сторінка, PDF, лист) — щоб у
-- юр. особи-покупця не дописувати керівника від руки (20.10.2026).
-- Для наявних контрагентів NULL — рядок лишається порожнім, як і раніше.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS signatory_name TEXT,
  ADD COLUMN IF NOT EXISTS signatory_position TEXT;
