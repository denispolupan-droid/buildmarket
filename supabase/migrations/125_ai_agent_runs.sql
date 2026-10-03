-- Журнал запусків ШІ-агентів (спільний для всіх агентів, крім чатів МП, у яких
-- своя таблиця marketplace_chat_drafts з міграції 122).
--
-- Навіщо: кожен агент має відповідати на три питання власника — скільки
-- коштує, що запропонував і чи цим скористалися. Без журналу ці відповіді
-- шукати ніде. Перший клієнт — агент заведення картки товару
-- (lib/product-card-proposer.ts): input = назва від постачальника, output =
-- запропонована картка; outcome ставиться, коли менеджер зберіг товар.
CREATE TABLE IF NOT EXISTS ai_agent_runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent         TEXT        NOT NULL,            -- 'product_card' | …
  input         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  output        JSONB,                           -- що запропонував агент
  model         TEXT        NOT NULL,
  cost_usd      NUMERIC(10,4) NOT NULL DEFAULT 0,
  input_tokens  INTEGER     NOT NULL DEFAULT 0,
  output_tokens INTEGER     NOT NULL DEFAULT 0,
  tool_calls    INTEGER     NOT NULL DEFAULT 0,
  duration_ms   INTEGER,
  error         TEXT,                            -- якщо запуск упав
  outcome       TEXT,                            -- 'applied' | 'discarded' | …
  outcome_ref   TEXT,                            -- напр. SKU створеного товару
  outcome_at    TIMESTAMPTZ,
  created_by    TEXT,                            -- email менеджера
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_agent_created ON ai_agent_runs (agent, created_at DESC);

-- Як і решта службових таблиць адмінки: доступ лише через service role.
ALTER TABLE ai_agent_runs ENABLE ROW LEVEL SECURITY;
