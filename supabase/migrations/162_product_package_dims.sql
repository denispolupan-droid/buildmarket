-- 162. Габарити упаковки товару (мм) — ручне значення з картки.
--
-- ЧОМУ
-- 12.11.2026: накладні Rozetka, ROZETKA Доставки, Meest-Епіцентр і поштоматів НП
-- вимагають габарити, фід Епіцентру — теж. Оцінку за назвою й вагою рахує код
-- (lib/package-dims.estimateItemPackage); ці колонки — лише виправлення людиною,
-- коли оцінка не збігається з реальною упаковкою. NULL — беремо оцінку.

alter table public.products
  add column if not exists package_length_mm integer check (package_length_mm is null or package_length_mm between 1 and 5000),
  add column if not exists package_width_mm  integer check (package_width_mm  is null or package_width_mm  between 1 and 5000),
  add column if not exists package_height_mm integer check (package_height_mm is null or package_height_mm between 1 and 5000);

comment on column public.products.package_length_mm is 'Габарит упаковки, мм (ручне; NULL — оцінка lib/package-dims)';
comment on column public.products.package_width_mm  is 'Габарит упаковки, мм (ручне; NULL — оцінка lib/package-dims)';
comment on column public.products.package_height_mm is 'Габарит упаковки, мм (ручне; NULL — оцінка lib/package-dims)';
