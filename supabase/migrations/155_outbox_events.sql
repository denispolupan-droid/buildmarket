-- 155: outbox подій замовлення (docs/OUTBOX-PLAN.md, фаза 0).
--
-- Побічні ефекти (пуш ЕН/статусу на площадку, уведомлення покупцю) пишуться в
-- outbox_events У ТІЙ САМІЙ транзакції, що й зміна замовлення — через
-- order_transition_outbox(). Доставляє їх крон outbox-sweep (раз на хвилину):
-- бере пачку через outbox_claim(), виконує обробник, ставить done / повтор за
-- backoff (1, 5, 15, 30 хв) / failed + один алерт після 5-ї невдачі.
-- Код у таблицю пише лише через ці дві функції й оновлення статусу рядка.

CREATE TABLE IF NOT EXISTS outbox_events (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aggregate     TEXT        NOT NULL DEFAULT 'order',
  aggregate_id  UUID        NOT NULL,
  event         TEXT        NOT NULL,
  handler       TEXT        NOT NULL,
  payload       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key    TEXT        NOT NULL UNIQUE,
  status        TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'done', 'failed', 'skipped')),
  attempts      INT         NOT NULL DEFAULT 0,
  next_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until  TIMESTAMPTZ,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events (aggregate_id, id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_outbox_aggregate ON outbox_events (aggregate_id, created_at DESC);

ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON outbox_events FROM anon, authenticated;

COMMENT ON TABLE outbox_events IS
  'Outbox подій замовлення: побічні ефекти (пуші на площадки, уведомлення) із повторами й слідом. docs/OUTBOX-PLAN.md';

-- Атомарно: оновити колонки orders з p_patch і записати події в outbox.
-- p_patch — {колонка: значення} (лише наявні колонки orders, інакше помилка);
-- p_events — [{event, handler, payload, dedupe_key}]; дубль dedupe_key мовчки
-- пропускається (повторна відгрузка з тією ж ЕН не плодить рядків).
CREATE OR REPLACE FUNCTION order_transition_outbox(p_order_id UUID, p_patch JSONB, p_events JSONB DEFAULT '[]'::jsonb)
RETURNS INT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cols     TEXT;
  v_keys     INT;
  v_known    INT;
  v_ev       JSONB;
  v_inserted INT := 0;
  v_rows     INT;
BEGIN
  IF p_patch IS NOT NULL AND p_patch <> '{}'::jsonb THEN
    SELECT count(*) INTO v_keys FROM jsonb_object_keys(p_patch);
    SELECT string_agg(format('%I', k), ', '), count(*) INTO v_cols, v_known
    FROM jsonb_object_keys(p_patch) k
    WHERE EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = 'orders' AND c.column_name = k
    );
    IF v_known <> v_keys THEN
      RAISE EXCEPTION 'order_transition_outbox: patch містить невідому колонку orders';
    END IF;
    EXECUTE format(
      'UPDATE orders SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::orders, $1)) WHERE id = $2',
      v_cols, v_cols
    ) USING p_patch, p_order_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'order_transition_outbox: замовлення % не знайдено', p_order_id;
    END IF;
  END IF;

  FOR v_ev IN SELECT * FROM jsonb_array_elements(COALESCE(p_events, '[]'::jsonb)) LOOP
    IF v_ev->>'event' IS NULL OR v_ev->>'handler' IS NULL OR v_ev->>'dedupe_key' IS NULL THEN
      RAISE EXCEPTION 'order_transition_outbox: подія без event/handler/dedupe_key';
    END IF;
    INSERT INTO outbox_events (aggregate, aggregate_id, event, handler, payload, dedupe_key)
    VALUES ('order', p_order_id, v_ev->>'event', v_ev->>'handler', COALESCE(v_ev->'payload', '{}'::jsonb), v_ev->>'dedupe_key')
    ON CONFLICT (dedupe_key) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_inserted := v_inserted + v_rows;
  END LOOP;

  RETURN v_inserted;
END;
$$;

-- Пачка для диспетчера: суворий порядок у межах замовлення — береться лише
-- НАЙСТАРІША pending-подія кожного замовлення, і лише якщо вона вже на часі й
-- не в оренді (поки вона чекає повтору чи виконується, наступні події цього
-- замовлення не беруться). Оренда на p_lease_seconds, attempts + 1.
CREATE OR REPLACE FUNCTION outbox_claim(p_limit INT DEFAULT 20, p_lease_seconds INT DEFAULT 300)
RETURNS SETOF outbox_events
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  WITH oldest AS (
    SELECT DISTINCT ON (aggregate_id) id, next_at, locked_until
    FROM outbox_events
    WHERE status = 'pending'
    ORDER BY aggregate_id, id
  ),
  cand AS (
    SELECT id FROM oldest
    WHERE next_at <= now()
      AND (locked_until IS NULL OR locked_until < now())
    ORDER BY id
    LIMIT p_limit
  )
  UPDATE outbox_events o
  SET locked_until = now() + make_interval(secs => p_lease_seconds),
      attempts     = attempts + 1
  FROM cand
  WHERE o.id = cand.id
  RETURNING o.*;
$$;

REVOKE ALL ON FUNCTION order_transition_outbox(UUID, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION outbox_claim(INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION order_transition_outbox(UUID, JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION outbox_claim(INT, INT) TO service_role;

NOTIFY pgrst, 'reload schema';
