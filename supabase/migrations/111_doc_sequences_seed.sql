-- 111: типи документів і нумератори, які в prod додали вручну (без міграції), а в
-- test їх не було — інтеграційний тест оплати падав з «Unknown doc_type:
-- customer_payment». Ідемпотентно: у prod рядки вже є, ON CONFLICT нічого не
-- перезаписує (лічильники не чіпаємо).
INSERT INTO acc_doc_types (code, name, direction, sort_order) VALUES
  ('customer_payment',          'Оплата від клієнта (ПКО)',     'none', 100),
  ('customer_payment_reversal', 'Повернення оплати клієнту',    'none', 101),
  ('supplier_payment',          'Оплата постачальнику (РКО)',   'none', 102),
  ('cash_in',                   'Прихід готівки',               'none', 103),
  ('cash_out',                  'Видача готівки',               'none', 104)
ON CONFLICT (code) DO NOTHING;

INSERT INTO acc_doc_sequences (doc_type, prefix, year, last_number) VALUES
  ('customer_payment',          'ПКО', EXTRACT(YEAR FROM NOW())::INT, 0),
  ('customer_payment_reversal', 'РКО', EXTRACT(YEAR FROM NOW())::INT, 0),
  ('supplier_payment',          'ПС',  EXTRACT(YEAR FROM NOW())::INT, 0),
  ('cash_in',                   'КО',  EXTRACT(YEAR FROM NOW())::INT, 0),
  ('cash_out',                  'РО',  EXTRACT(YEAR FROM NOW())::INT, 0)
ON CONFLICT (doc_type) DO NOTHING;
