-- Журнал офлайн-конверсій, відданих у Google Ads (uploadClickConversions).
--
-- Навіщо: на сайті немає тега Google (його блокує CSP), тож Ads не бачить
-- жодної покупки й оптимізує ставки на кліки. Замість тега віддаємо конверсії
-- з сервера: замовлення з gclid, яке перейшло в confirmed/shipped/delivered, —
-- це конверсія з цінністю = сума замовлення. Скасоване після вивантаження —
-- відкликаємо (RETRACTION). Наповнює крон ads-spend (lib/google-ads.ts).
--
-- Один рядок на замовлення: вивантажили — uploaded_at, відкликали — retracted_at,
-- не прийняв Google — error (наступний прогін спробує ще раз).

CREATE TABLE IF NOT EXISTS ads_conversions (
  order_id          UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  order_number      INT,
  gclid             TEXT NOT NULL,
  conversion_action TEXT NOT NULL,          -- customers/<cid>/conversionActions/<id>
  value             NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'UAH',
  conversion_time   TIMESTAMPTZ NOT NULL,   -- час замовлення, який віддали Google
  uploaded_at       TIMESTAMPTZ,
  retracted_at      TIMESTAMPTZ,
  error             TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ads_conversions ENABLE ROW LEVEL SECURITY;
-- лише service role (крон і адмінка)
