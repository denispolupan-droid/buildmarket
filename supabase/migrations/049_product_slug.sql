-- ЧПУ-слаги товарів (SEO): /product/{slug} замість /product/{sku}.
-- Старі SKU-URL лишаються робочими через 308-редірект на слаг.
ALTER TABLE products ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
