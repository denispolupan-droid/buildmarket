-- ══════════════════════════════════════════════════════════════════════════════
-- 031: Безпечний скид тестових даних обліку
--
-- reset_accounting_test_data() — TRUNCATE всіх облікових таблиць.
-- Відмовляє якщо є документи без мітки meta.test=true.
-- Використовується в integration tests (afterAll).
-- НІКОЛИ не викликати вручну на БД з реальними даними!
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION reset_accounting_test_data()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  non_test_count INT;
BEGIN
  SELECT COUNT(*) INTO non_test_count
  FROM acc_documents
  WHERE (meta->>'test')::boolean IS NOT TRUE;

  IF non_test_count > 0 THEN
    RETURN format(
      'REFUSED: %s non-test documents exist. '
      'Only call this when all data has meta.test=true.',
      non_test_count
    );
  END IF;

  TRUNCATE
    money_entries,
    counterparty_balances,
    stock_movements,
    stock_batches,
    stock_reservations,
    stock_balance,
    acc_document_lines,
    acc_documents
  RESTART IDENTITY CASCADE;

  RETURN 'OK: accounting tables reset';
END;
$$;
