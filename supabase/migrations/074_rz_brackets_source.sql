-- 074: источник строки бракета — 'tariff' (из файла Rozetka) или 'manual' (ручная
-- достройка пробелов тарифа). Импорт тарифного файла заменяет только source='tariff',
-- ручные достройки (недостающие базовые тиры, которых нет в выгрузке Rozetka) сохраняются.

ALTER TABLE rozetka_commission_brackets
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'tariff';
