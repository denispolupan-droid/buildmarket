-- Стан SEO-контенту товару БЕЗ самих текстів.
--
-- Розділ /admin/seo рахував пробіли в JS і тому тягнув description_full і
-- description_full_ru всіх активних товарів — 3.5 МБ на кожне відкриття
-- сторінки заради того, щоб виміряти .length. Довжини рахує Postgres, назовні
-- їдуть тільки числа й прапорці (≈150 КБ).
--
-- Тут же — кількість FAQ і характеристик, щоб не витягувати таблиці на 11k+
-- рядків тільки заради «є / немає».

create or replace view public.product_seo_state as
select
  p.sku,
  p.slug,
  p.name,
  p.brand,
  p.category_slug,
  coalesce(length(p.description_full), 0)                            as desc_len,
  coalesce(length(p.description_full_ru), 0)                         as desc_ru_len,
  (p.name_ru is null or btrim(p.name_ru) = ''
    or p.description_ru is null or btrim(p.description_ru) = '')     as no_ru,
  (p.keywords is null or btrim(p.keywords) = '')                     as no_keywords,
  (p.image is null or btrim(p.image) = '')                           as no_image,
  (select count(*) from public.product_faq f
     where f.product_sku = p.sku)                                    as faq_count,
  (select count(*) from public.product_faq f
     where f.product_sku = p.sku and f.question_ru is null)           as faq_untranslated,
  (select count(*) from public.product_characteristics c
     where c.product_sku = p.sku)                                    as chars_count
from public.products p
where p.is_active = true;

-- security_invoker: вʼюха не має обходити RLS товарів від імені власника.
alter view public.product_seo_state set (security_invoker = on);

-- Читає лише адмінка через service_role — публічним ролям не потрібна.
revoke all on public.product_seo_state from anon, authenticated;
grant select on public.product_seo_state to service_role;

-- Підзапити вище ходять по product_sku — без індексів це seq scan на кожен товар.
create index if not exists product_faq_product_sku_idx
  on public.product_faq (product_sku);
create index if not exists product_characteristics_product_sku_idx
  on public.product_characteristics (product_sku);
