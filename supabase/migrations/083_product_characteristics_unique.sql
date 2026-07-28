-- Заборона дублікатів характеристик на рівні БД.
-- ⚠️ Застосовувати ТІЛЬКИ після чистки даних:
--   node scripts/supabase/canonicalize-characteristics.mjs --apply
-- (multiselect-значення після чистки зберігаються одним рядком через кому,
--  тому унікальність (product_sku, label) стає коректною для всіх лейблів).
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_characteristics_sku_label
  ON product_characteristics (product_sku, label);
