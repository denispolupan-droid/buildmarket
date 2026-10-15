-- 129: blog_posts.noindex — стаття лишається на сайті, але закрита від пошуку.
--
-- 15.10.2026: після Google September Spam Update (24.09–08.10) ШІ-гайди блогу
-- випали з широких запитів (розбір у пам'яті seo-drop-2026-10). Статті без
-- жодного показу за 28 днів закриваємо noindex,follow і прибираємо з sitemap /
-- RSS / llms.txt, щоб не нарощувати частку тонкого контенту; видаляти не треба —
-- внутрішні посилання і «Читайте також» лишаються робочими.

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS noindex boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.blog_posts.noindex IS 'Закрита від індексації (robots noindex,follow; не в sitemap/RSS/llms.txt), але доступна на сайті';
