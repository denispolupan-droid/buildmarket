-- Журнал SEO-дій над сторінками.
--
-- У розділі SEO не було видно, що зі сторінкою вже працювали: дожимали статтю,
-- переписували картку, чіпляли товари. Через це легко зробити те саме вдруге
-- (і заплатити за генерацію ще раз) або, навпаки, забути, що сторінку вже
-- закрили. updated_at для цього не годиться — він змінюється й від сторонніх
-- правок і не каже, ЩО саме робили.
--
-- page_path зберігаємо нормалізованим, без домену й без мовного префікса:
-- /blog/betonokontakt, /product/hermetyk-... — щоб укр і рос версії однієї
-- сторінки лягали в один рядок історії.
CREATE TABLE IF NOT EXISTS seo_actions (
  id          BIGSERIAL   PRIMARY KEY,
  page_path   TEXT        NOT NULL,
  action      TEXT        NOT NULL
                          CHECK (action IN ('article_boost', 'article_products', 'product_boost', 'cover')),
  query       TEXT,
  meta        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  TEXT
);

CREATE INDEX IF NOT EXISTS idx_seo_actions_page ON seo_actions(page_path, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_actions_recent ON seo_actions(created_at DESC);
