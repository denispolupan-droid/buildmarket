-- Блог у БД (SEO: регулярні статті під інформаційні запити без деплою коду).
-- Гібрид: старі статті лишаються в коді (lib/blog.ts), нові — тут.
CREATE TABLE IF NOT EXISTS blog_posts (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  title_ru TEXT,
  description TEXT NOT NULL,
  description_ru TEXT,
  category TEXT NOT NULL DEFAULT 'Поради',
  category_ru TEXT DEFAULT 'Советы',
  read_time INT NOT NULL DEFAULT 5,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  image TEXT,
  content_html TEXT NOT NULL,
  content_html_ru TEXT,
  faq JSONB NOT NULL DEFAULT '[]',
  faq_ru JSONB NOT NULL DEFAULT '[]',
  related_links JSONB NOT NULL DEFAULT '[]',
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(is_published, published_at DESC);
