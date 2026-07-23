-- 076: дозволяємо оплачувати витрату з рахунку NovaPay (накопичений COD).
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_payment_method_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_payment_method_check
  CHECK (payment_method = ANY (ARRAY['bank','cash','acquiring','novapay']::text[]));
