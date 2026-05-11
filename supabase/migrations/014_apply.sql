CREATE TABLE IF NOT EXISTS partner_balance_transactions (
  id            BIGSERIAL     PRIMARY KEY,
  customer_id   UUID          NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tx_type       TEXT          NOT NULL CHECK (tx_type IN (
                  'top_up','charge','cod_credit','np_fee',
                  'return_refund','return_fee','payout','goods_offset','adjustment'
                )),
  amount        NUMERIC(14,2) NOT NULL,
  balance_after NUMERIC(14,2),
  order_id      UUID,
  description   TEXT          NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by    TEXT
);

CREATE INDEX IF NOT EXISTS idx_pbt_customer
  ON partner_balance_transactions(customer_id, created_at DESC);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS balance      NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_held NUMERIC(14,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION fn_update_partner_balance()
RETURNS TRIGGER
LANGUAGE plpgsql AS
$$
DECLARE
  v_new_balance NUMERIC(14,2);
BEGIN
  UPDATE customers
  SET balance = balance + NEW.amount
  WHERE id = NEW.customer_id
  RETURNING balance INTO v_new_balance;

  UPDATE partner_balance_transactions
  SET balance_after = v_new_balance
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_partner_balance
  AFTER INSERT ON partner_balance_transactions
  FOR EACH ROW EXECUTE FUNCTION fn_update_partner_balance();

CREATE TABLE IF NOT EXISTS partner_payout_requests (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID          NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  method        TEXT          NOT NULL DEFAULT 'bank'
                  CHECK (method IN ('bank','goods_offset')),
  bank_details  TEXT,
  status        TEXT          NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','paid','rejected')),
  notes         TEXT,
  requested_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ,
  processed_by  TEXT
);

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS qty_is_flag BOOLEAN DEFAULT false;
