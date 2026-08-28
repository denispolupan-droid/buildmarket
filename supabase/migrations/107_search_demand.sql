-- «Невидимий попит»: фрази з автопідказок Google по темах категорій.
-- Search Console показує лише запити, де сайт УЖЕ показувався (≈1 600 за 90 днів);
-- автопідказки — те, що люди набирають насправді, включно з темами, яких у нас
-- немає взагалі (пробне зняття 28.08: 99 % фраз відсутні в GSC). Крон
-- demand-crawl раз на тиждень обходить категорії × модифікатори (uk+ru) і
-- накопичує фрази; звірка з GSC і з нашим контентом — при читанні.

CREATE TABLE IF NOT EXISTS search_demand (
  phrase          TEXT        NOT NULL,
  lang            TEXT        NOT NULL CHECK (lang IN ('uk', 'ru')),
  category_slug   TEXT        NOT NULL,          -- тема-джерело (насіння запиту)
  modifier        TEXT        NOT NULL DEFAULT '',-- «як», «який», «скільки», … або ''
  first_seen      DATE        NOT NULL DEFAULT CURRENT_DATE,
  last_seen       DATE        NOT NULL DEFAULT CURRENT_DATE,
  seen            INT         NOT NULL DEFAULT 1, -- у скількох обходах трапилась
  gsc_impressions INT,                            -- покази в GSC за 90 днів на момент обходу (NULL — нас там немає)
  gsc_position    NUMERIC(6,1),
  covered_path    TEXT,                           -- наша сторінка, що вже відповідає на фразу (стаття/категорія), якщо знайдено
  PRIMARY KEY (phrase, lang)
);
CREATE INDEX IF NOT EXISTS idx_search_demand_cat ON search_demand(category_slug, lang);

ALTER TABLE search_demand ENABLE ROW LEVEL SECURITY;
-- лише service role (крон і адмінка); публічних читачів немає
