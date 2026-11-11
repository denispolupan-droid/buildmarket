-- 161. Корекції цін (акції й тимчасові зміни, міграція 147) — і для Епіцентру.
--
-- ЧОМУ
-- 11.11.2026 Епіцентр отримав власну наценку (копія Prom) і реальні комісії
-- категорій, а ціни йдуть на площадку щогодини (/api/cron/epicentr-offers).
-- Власник попросив ту саму переоцінку й акції з розділу «Ціни», що є для
-- Rozetka/Prom. Модель та сама: ціна = формула від наценки × Π корекцій каналу;
-- у фід/пуш для акції йде й стара ціна (без акційного множника).
--
-- Що змінюється: лише перелік дозволених каналів. Існуючі рядки не чіпаємо.

alter table public.price_adjustments
  drop constraint if exists price_adjustments_channel_check;

alter table public.price_adjustments
  add constraint price_adjustments_channel_check
  check (channel in ('prom', 'rozetka', 'epicentr'));
