-- Чернетки відповідей покупцям у чатах маркетплейсів, які готує ШІ-помічник
-- (lib/marketplace-chat-assistant.ts). Менеджер бачить чернетку в треді
-- «Чати МП», править або відправляє як є.
--
-- Навіщо таблиця, а не просто відповідь у HTTP:
--  • кеш: повторне відкриття того самого треда без нових вхідних не має
--    коштувати другого виклику моделі — ключ (mp, chat_id, last_incoming_at);
--  • статистика: скільки чернеток пішло без правок (outcome = sent_as_is),
--    скільки правили, скільки викинули. Саме з цих цифр вирішуватимемо,
--    які категорії питань можна буде колись відповідати автоматично;
--  • вартість: кожен запуск пише свій usage і ціну, як seo_actions.cost_usd.
--
-- last_incoming_at — мітка часу площадки як рядок («2026-09-30 10:15:02»),
-- з тих самих міркувань, що й у marketplace_chat_seen: порівнюємо час площадки
-- з часом площадки, без зведення до UTC.
CREATE TABLE IF NOT EXISTS marketplace_chat_drafts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mp               TEXT        NOT NULL CHECK (mp IN ('rozetka', 'prom')),
  chat_id          TEXT        NOT NULL,          -- rozetka: id чату · prom: room_ident
  last_incoming_at TEXT        NOT NULL,          -- мітка останнього повідомлення покупця
  category         TEXT        NOT NULL,          -- availability | delivery | order_status | …
  summary          TEXT        NOT NULL,          -- один рядок: про що питає покупець
  draft            TEXT        NOT NULL,          -- текст відповіді
  needs_human      BOOLEAN     NOT NULL DEFAULT false,
  reason           TEXT,                          -- чому потрібна людина / що перевірити
  model            TEXT        NOT NULL,
  cost_usd         NUMERIC(10,4) NOT NULL DEFAULT 0,
  input_tokens     INTEGER     NOT NULL DEFAULT 0,
  output_tokens    INTEGER     NOT NULL DEFAULT 0,
  tool_calls       INTEGER     NOT NULL DEFAULT 0,
  outcome          TEXT        CHECK (outcome IN ('sent_as_is', 'edited', 'discarded')),
  sent_text        TEXT,                          -- що реально пішло покупцю
  outcome_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mp, chat_id, last_incoming_at)
);

CREATE INDEX IF NOT EXISTS idx_mp_chat_drafts_created ON marketplace_chat_drafts (created_at DESC);

-- Як і решта службових таблиць адмінки: доступ лише через service role.
ALTER TABLE marketplace_chat_drafts ENABLE ROW LEVEL SECURITY;
