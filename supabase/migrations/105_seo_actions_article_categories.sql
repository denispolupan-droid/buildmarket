-- Журнал SEO-дій: новий тип «контекстні посилання зі статті на категорії».
--
-- Фаза 2 плану по категоріях (27.08.2026): перше згадування категорії в тілі
-- статті стає посиланням на неї (lib/article-links, на рендері). Дія
-- фіксується в журналі один раз на статтю — щоб ретроспективний замір
-- (gsc_daily: 28 днів до / 28 після) показав, чи підняло це КАТЕГОРІЮ, а не
-- лише статтю. Замір зачепить обидві сторінки: page_path — стаття, а
-- meta.categories — куди вели посилання.

alter table public.seo_actions drop constraint if exists seo_actions_action_check;
alter table public.seo_actions add constraint seo_actions_action_check
  check (action in (
    'article_boost',      -- дожим наявної статті під запит
    'article_products',   -- блок посилань на товари у статті
    'article_new',        -- нова стаття під запит
    'article_categories', -- контекстні посилання зі статті на категорії (фаза 2)
    'product_boost',      -- перезапис картки товару під запит
    'cover',              -- обкладинка статті
    'meta_rewrite'        -- переписаний title/description
  ));
