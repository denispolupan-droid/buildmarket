-- ── Чат підтримки ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_sessions (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  visitor_id      TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'open',  -- open | resolved
  created_at      TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ DEFAULT now(),
  unread_count    INT         NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_last ON chat_sessions(last_message_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id  UUID        NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
-- service_role bypasses RLS by default in Supabase — API routes use service key
