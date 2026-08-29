-- Лінійки фасовок: половина каталогу (402 з 775 товарів) — 156 лінійок по 2–6
-- фасовок одного продукту, і в 101 з них Google показує по кілька фасовок за
-- одним запитом, ділячи сигнали. «Головна» фасовка лінійки збирає їх на себе:
-- ProductGroup-розмітка, item_group_id у фіді Merchant, sitemap лише головних,
-- і — де одна фасовка вже домінує — canonical з решти на неї.
--
-- variant_main_sku ставить скрипт scripts/seo-variant-lines.mts ОДИН РАЗ за
-- даними Search Console (не перераховується автоматично: canonical, що скаче
-- між фасовками, гірший за його відсутність). Для головної фасовки — власний sku.
-- variant_canonical — чи віддавати canonical на головну (фаза 2, поступово).

ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_main_sku TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_canonical BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_products_variant_main ON products(variant_main_sku) WHERE variant_main_sku IS NOT NULL;
