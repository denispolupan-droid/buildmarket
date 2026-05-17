-- ============================================================
-- Захист stock_balance від від'ємних значень
-- ============================================================
-- Без цих constraints тригер fn_update_stock_balance може
-- довести qty_total до від'ємного числа при помилковому
-- документі списання. Негативний залишок — інвентарна брехня.
-- ============================================================

ALTER TABLE stock_balance
  ADD CONSTRAINT chk_qty_total_nonneg
    CHECK (qty_total >= 0),
  ADD CONSTRAINT chk_qty_reserved_nonneg
    CHECK (qty_reserved >= 0);

-- qty_available = qty_total - qty_reserved — вже GENERATED,
-- але може бути від'ємним якщо qty_reserved > qty_total.
-- Окремий constraint:
ALTER TABLE stock_balance
  ADD CONSTRAINT chk_reserved_lte_total
    CHECK (qty_reserved <= qty_total);
