-- Словник характеристик: канонічні лейбли + синоніми (аліаси)
-- та обов'язкові/типові набори характеристик на категорію.
-- Єдине джерело правди для: AI-генерації, ручного редагування, чистки даних,
-- SEO-черги (контроль пробілів). Наповнюється scripts/supabase/seed-char-dictionary.mjs.
CREATE TABLE IF NOT EXISTS characteristic_definitions (
  id             SERIAL   PRIMARY KEY,
  label          TEXT     NOT NULL UNIQUE,          -- канонічний лейбл (укр, звичайний апостроф)
  aliases        TEXT[]   NOT NULL DEFAULT '{}',    -- синоніми, що зливаються в цей лейбл (lowercase)
  is_multiselect BOOLEAN  NOT NULL DEFAULT FALSE,   -- значення-перелік: зберігаємо одним рядком через кому, фіди розгортають
  unit           TEXT,                              -- підказка одиниці для значень ("°C", "год", "л")
  sort_order     INT      NOT NULL DEFAULT 500      -- глобальний порядок відображення (Бренд/Країна — в кінці)
);

CREATE TABLE IF NOT EXISTS category_characteristics (
  category_slug  TEXT     NOT NULL,
  definition_id  INT      NOT NULL REFERENCES characteristic_definitions(id) ON DELETE CASCADE,
  required       BOOLEAN  NOT NULL DEFAULT FALSE,   -- обов'язкова для товарів категорії
  default_value  TEXT,                              -- типове значення (для автозаповнення, якщо AI/люди не дали свого)
  sort_order     INT,                               -- порядок в межах категорії (NULL → глобальний з definitions)
  PRIMARY KEY (category_slug, definition_id)
);
CREATE INDEX IF NOT EXISTS idx_category_chars_cat ON category_characteristics(category_slug);

-- Як і prom_attributes: доступ лише через service role (адмінка/скрипти)
ALTER TABLE characteristic_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_characteristics   ENABLE ROW LEVEL SECURITY;
