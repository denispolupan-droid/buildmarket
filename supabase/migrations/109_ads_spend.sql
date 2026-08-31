-- Витрати Google Ads по кампаніях і днях — для ROMI у Фінанси → «Реклама».
-- Наповнює щоденний крон ads-spend (Google Ads API, креденшали в app_settings:
-- google_ads_client_id/secret/refresh_token/developer_token/manager_id/customer_id).
-- Витрата приходить у мікрогривнях (cost_micros) — зберігаємо як є, ділимо на
-- 1e6 при читанні: так число лишається точним і звіряється з кабінетом.

CREATE TABLE IF NOT EXISTS ads_spend (
  date          DATE    NOT NULL,
  campaign_id   BIGINT  NOT NULL,
  campaign_name TEXT    NOT NULL,
  channel_type  TEXT,              -- SEARCH / PERFORMANCE_MAX / SHOPPING / …
  cost_micros   BIGINT  NOT NULL DEFAULT 0,
  clicks        INT     NOT NULL DEFAULT 0,
  impressions   INT     NOT NULL DEFAULT 0,
  conversions   NUMERIC(12,2) NOT NULL DEFAULT 0,
  conv_value    NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency      TEXT    NOT NULL DEFAULT 'UAH',
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (date, campaign_id)
);
CREATE INDEX IF NOT EXISTS idx_ads_spend_date ON ads_spend(date);

ALTER TABLE ads_spend ENABLE ROW LEVEL SECURITY;
-- лише service role (крон і адмінка)
