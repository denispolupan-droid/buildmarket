-- Контент категорій (опис, seoText, FAQ, гайд «Як вибрати», «Дивіться також»)
-- переїжджає з коду (lib/category-descriptions*.ts, ~780 КБ джерела) у БД —
-- щоб власник редагував і генерував його в адмінці без деплою.
-- Одна строка = одна категорія однією мовою; ru — самостійний текст, не переклад.
-- Ціни в текстах — токенами {price:SKU} (lib/seo/guide-prices), не цифрами.

CREATE TABLE IF NOT EXISTS category_content (
  slug        TEXT        NOT NULL,
  lang        TEXT        NOT NULL CHECK (lang IN ('uk', 'ru')),
  description TEXT        NOT NULL DEFAULT '',
  seo_text    TEXT,
  faq         JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- [{q, a}]
  guide       JSONB,                                      -- {title, sections: [{h, p: [..]}]}
  related     JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- [{href, label}]
  blog_slug   TEXT,
  source      TEXT        NOT NULL DEFAULT 'manual' CHECK (source IN ('seed', 'manual', 'ai')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT,
  PRIMARY KEY (slug, lang)
);

ALTER TABLE category_content ENABLE ROW LEVEL SECURITY;
-- Публічний контент: читати можна всім (сайт рендерить його в HTML), писати — лише service role.
DROP POLICY IF EXISTS category_content_read ON category_content;
CREATE POLICY category_content_read ON category_content FOR SELECT USING (true);

-- Журнал SEO: нова дія «контент категорії» (збережено/згенеровано в адмінці)
ALTER TABLE seo_actions DROP CONSTRAINT IF EXISTS seo_actions_action_check;
ALTER TABLE seo_actions ADD CONSTRAINT seo_actions_action_check
  CHECK (action IN ('article_boost', 'article_products', 'article_new', 'article_categories', 'product_boost', 'cover', 'meta_rewrite', 'category_content'));
