-- Прив'язка оплат постачальнику до конкретних боргів (як рознесення ПКО в 1С).
--
-- Досі борг перед постачальником був одним сальдо: оплата зменшувала суму, але
-- не було видно, ЯКІ саме накладні закриті, а які висять. Через це неможливо
-- відповісти на просте питання «за що ми ще винні» — а саме воно виникає при
-- звірці з постачальником.
--
-- Прив'язуємось до ПРОВОДОК (money_entries), а не до документів: один документ
-- може породити борг перед двома постачальниками одразу (замовлення з різних
-- складів), і сальдо все одно рахується по проводках. Так залишок за накладною
-- рахується тим самим числом, що й баланс, і вони не можуть розійтись.
--
-- Таблиця похідна: її можна перерахувати з нуля, не чіпаючи сам облік.

CREATE TABLE IF NOT EXISTS supplier_payment_allocations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Проводка оплати (amount > 0 на рахунку supplier)
  payment_entry_id UUID NOT NULL REFERENCES money_entries(id) ON DELETE CASCADE,
  -- Проводка боргу (amount < 0): прихід або РН із дропшип-рядками
  charge_entry_id  UUID NOT NULL REFERENCES money_entries(id) ON DELETE CASCADE,
  amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       TEXT,
  -- Одна пара «оплата ↔ борг» — один рядок: повторне рознесення тієї самої
  -- оплати на ту саму накладну означало б подвійне закриття.
  UNIQUE (payment_entry_id, charge_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_spa_payment ON supplier_payment_allocations (payment_entry_id);
CREATE INDEX IF NOT EXISTS idx_spa_charge  ON supplier_payment_allocations (charge_entry_id);

COMMENT ON TABLE supplier_payment_allocations IS
  'Рознесення оплат постачальнику по конкретних боргах. Залишок за накладною = |сума проводки| − сума рознесень.';
