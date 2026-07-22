-- 073: Ценовые пороги комиссий Rozetka (per-category price brackets)
--
-- Rozetka начисляет комиссию по (категория, ценовой диапазон): чем дороже товар —
-- тем ниже %. Раньше мы хранили одну плоскую ставку на категорию (по сути — самый
-- дешёвый тир), что завышало комиссию для дорогих товаров. Эта таблица хранит полную
-- лестницу порогов из тарифного файла Rozetka; расчёт выбирает бракет по цене товара.
--
-- base_pct — базовый % Rozetka (ДО сбора). Эффективная ставка = base_pct * 1.08
-- (сбор/НДС площадки), как и в остальной системе.

CREATE TABLE IF NOT EXISTS rozetka_commission_brackets (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rz_id         text        NOT NULL,               -- id категории-узла тарифа Rozetka
  category_name text,                               -- читаемое имя (из файла тарифа)
  brand         text        NOT NULL DEFAULT '-',   -- бренд-ставка ('-' = дефолт)
  price_from    numeric     NOT NULL DEFAULT 0,     -- нижняя граница цены, включительно
  price_to      numeric     NOT NULL,               -- верхняя граница, включительно (открытый верх -> большой sentinel)
  base_pct      numeric     NOT NULL,               -- базовый % Rozetka (без ×1.08)
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rz_id, brand, price_from)
);

CREATE INDEX IF NOT EXISTS idx_rz_brackets_lookup
  ON rozetka_commission_brackets (rz_id, brand, price_from, price_to);

-- Внутренняя таблица начислений: читается только сервером (service role), пишется
-- только админ-импортом. Публичного доступа нет — RLS без разрешающих политик.
ALTER TABLE rozetka_commission_brackets ENABLE ROW LEVEL SECURITY;
