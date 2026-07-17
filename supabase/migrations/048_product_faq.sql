-- FAQ-блоки товарів (SEO_SPEC Фаза 5.5): питання-відповіді під пошукові запити.
-- Генеруються AI разом із description_full, рендеряться на сторінці товару + FAQPage JSON-LD.
-- Патерн повторює product_characteristics (публічна каталожна таблиця, без RLS).

CREATE TABLE IF NOT EXISTS product_faq (
  id BIGSERIAL PRIMARY KEY,
  product_sku TEXT NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  question_ru TEXT,
  answer_ru TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_faq_sku ON product_faq(product_sku);
