-- 031: Zoho Mail OAuth token storage
CREATE TABLE IF NOT EXISTS mail_oauth_tokens (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  access_token  TEXT        NOT NULL,
  refresh_token TEXT        NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  account_id    TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);
