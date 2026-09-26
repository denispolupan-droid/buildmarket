-- 1) Штрихкод товару (GTIN/EAN) — для фідів Merchant Center і ШІ-шопінгу
--    (OpenAI product feed, Google UCP): без ідентифікатора Google гірше матчить
--    оффер із запитами, а агентні протоколи вимагають його для покупки.
--    Даних поки немає — колонка чекає на імпорт із прайсів постачальників;
--    фіди виводять gtin лише коли він заповнений.
ALTER TABLE products ADD COLUMN IF NOT EXISTS gtin TEXT;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_gtin_format;
ALTER TABLE products ADD CONSTRAINT products_gtin_format
  CHECK (gtin IS NULL OR gtin ~ '^[0-9]{8}$' OR gtin ~ '^[0-9]{12,14}$');
COMMENT ON COLUMN products.gtin IS 'GTIN/EAN штрихкод (8, 12, 13 або 14 цифр) — фіди Merchant Center / OpenAI';

-- 2) Друге нагадування про відгук: перший лист дає ~4,5 % відгуків (44 → 2),
--    одне нагадування через ~9 днів без відгуку — найдешевший спосіб підняти
--    кількість (зірки AggregateRating у видачі). Крон review-requests.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS review_reminder_sent_at TIMESTAMPTZ;
