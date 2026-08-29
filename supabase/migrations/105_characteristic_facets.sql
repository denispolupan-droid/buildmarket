-- Фасети характеристик: закриті списки значень + прапорець «це фільтр».
-- Словник 082 знає лейбли й обов'язковість, але не значення і не «що є
-- фільтром» — тому AI писав вільний текст («Акрилова дисперсія (водна база)»),
-- а фільтри листингу будувалися чорним списком на клієнті.
-- Наповнюється scripts/supabase/seed-char-dictionary.mjs (CHAR_VALUES у
-- char-dictionary.mjs); читається lib/characteristics.ts (normalizeChars) і
-- листинги (фільтри — етап 2).

ALTER TABLE characteristic_definitions
  ADD COLUMN IF NOT EXISTS kind      TEXT    NOT NULL DEFAULT 'text'
    CHECK (kind IN ('enum', 'number', 'text')),   -- enum = значення лише зі списку characteristic_values
  ADD COLUMN IF NOT EXISTS is_filter BOOLEAN NOT NULL DEFAULT FALSE;  -- глобально фільтр (категорія може перекрити)

-- Канонічні значення для enum-лейблів. category_slugs — де діє правило
-- (slug категорії АБО родини-предка; '{}' = скрізь): «метал» у фарбах і в дисках —
-- різні речі. match_patterns — регекси (i) для канонізації вільного тексту;
-- aliases — точні синоніми (lowercase). Порядок = sort_order: перше правило,
-- що збіглося, виграє (для multiselect збираються всі).
CREATE TABLE IF NOT EXISTS characteristic_values (
  id             SERIAL  PRIMARY KEY,
  definition_id  INT     NOT NULL REFERENCES characteristic_definitions(id) ON DELETE CASCADE,
  category_slugs TEXT[]  NOT NULL DEFAULT '{}',
  value          TEXT    NOT NULL,
  aliases        TEXT[]  NOT NULL DEFAULT '{}',
  match_patterns TEXT[]  NOT NULL DEFAULT '{}',
  sort_order     INT     NOT NULL DEFAULT 500,
  UNIQUE (definition_id, value, category_slugs)
);
CREATE INDEX IF NOT EXISTS idx_char_values_def ON characteristic_values(definition_id);

-- Перекриття на рівні категорії: NULL → успадкувати definitions.is_filter.
ALTER TABLE category_characteristics
  ADD COLUMN IF NOT EXISTS is_filter    BOOLEAN,
  ADD COLUMN IF NOT EXISTS filter_order INT;

-- Як і 082: доступ лише через service role (адмінка/скрипти/сервер)
ALTER TABLE characteristic_values ENABLE ROW LEVEL SECURITY;
