-- 116  admin_products_list — легкий список товарів для адмінки
--
-- Сторінка «Товари» читала select(*) з products: 5 із 5,5 МБ каталогу — тексти
-- описів і keywords, які списку не потрібні (йому потрібні лише факти: довжина
-- повного опису для порогу 800, наявність рос. версії й keywords, кількість
-- характеристик). Представлення рахує ці факти в базі, тексти не залишають
-- Postgres. Читає лише service_role (адмінка); security_invoker — щоб не
-- обходити RLS від імені власника (див. 058).

create or replace view public.admin_products_list
  with (security_invoker = true) as
select
  p.id, p.sku, p.name, p.name_ru, p.brand, p.category_slug, p.volume, p.image,
  p.is_active, p.is_hit, p.is_new, p.sort_order, p.updated_at,
  coalesce(length(p.description_full), 0)    as description_full_len,
  coalesce(length(p.description_full_ru), 0) as description_full_ru_len,
  (p.description_ru is not null and p.description_ru <> '') as has_description_ru,
  (p.keywords is not null and p.keywords <> '')             as has_keywords,
  coalesce(c.cnt, 0)::int                    as characteristics_count
from public.products p
left join (
  select product_sku, count(*) as cnt
  from public.product_characteristics
  group by product_sku
) c on c.product_sku = p.sku;

revoke all on public.admin_products_list from anon, authenticated;
grant select on public.admin_products_list to service_role;

comment on view public.admin_products_list is
  'Список товарів для адмінки без текстів описів: довжини/наявність замість самих текстів, кількість характеристик.';
