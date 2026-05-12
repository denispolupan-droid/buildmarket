-- ============================================================
-- Формат номера замовлення: YYMM + 4 цифри від 1000
-- Приклад: 26051000, 26051001, 26051002...
-- Щомісяця лічильник скидається: 26061000, 26061001...
-- ============================================================

CREATE TABLE IF NOT EXISTS order_number_seq (
  ym       CHAR(4)  PRIMARY KEY,  -- '2605', '2606', ...
  last_val INTEGER  NOT NULL DEFAULT 999
);

CREATE OR REPLACE FUNCTION fn_generate_order_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_ym  CHAR(4);
  v_seq INTEGER;
BEGIN
  v_ym := to_char(NOW() AT TIME ZONE 'Europe/Kyiv', 'YYMM');

  INSERT INTO order_number_seq (ym, last_val)
  VALUES (v_ym, 1000)
  ON CONFLICT (ym) DO UPDATE
    SET last_val = order_number_seq.last_val + 1
  RETURNING last_val INTO v_seq;

  NEW.order_number := (v_ym || lpad(v_seq::text, 4, '0'))::BIGINT;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_number ON orders;

CREATE TRIGGER trg_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION fn_generate_order_number();
