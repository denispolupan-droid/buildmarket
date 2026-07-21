-- ============================================================================
-- 070  Per-order invoice display options
-- ============================================================================
-- Вікно налаштування рахунку: staff обирають, що показувати в рахунку (контактна
-- особа+телефон, адреса доставки, строк оплати/коментар). Зберігаємо як JSONB, щоб
-- не плодити колонки. Тип покупця (фіз/юр) лишається в окремому invoice_as_company
-- (міграція 069). null-опції означають дефолти, які обчислює lib/invoice-buyer.
--   { "show_contact": bool, "show_delivery": bool, "show_terms": bool }
-- ============================================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_options jsonb;
COMMENT ON COLUMN orders.invoice_options IS
  'Опції відображення рахунку: show_contact / show_delivery / show_terms. null = дефолти.';
