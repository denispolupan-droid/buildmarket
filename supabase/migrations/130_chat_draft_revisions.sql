-- Чернетки чатів МП: «направити» відповідь. Менеджер пише вказівку
-- («допиши, що повернемо за наш рахунок», «коротше») — агент переписує
-- поточну чернетку, а не генерує нову з нуля. Звідки б не прийшла вказівка
-- (адмінка чи reply в Telegram), вона потрапляє в історію правок: з неї видно,
-- чого бракує базовому промпту.
--
-- order_number / our_order_id / subject — контекст треда на момент чернетки:
-- переписування з Telegram відбувається без списку чатів, а агенту для
-- «допиши ТТН» потрібна привʼязка до замовлення.
ALTER TABLE marketplace_chat_drafts
  ADD COLUMN IF NOT EXISTS revisions    JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{at, by, via, instruction, before}]
  ADD COLUMN IF NOT EXISTS order_number INTEGER,
  ADD COLUMN IF NOT EXISTS our_order_id TEXT,
  ADD COLUMN IF NOT EXISTS subject      TEXT;

CREATE INDEX IF NOT EXISTS idx_mp_chat_drafts_tg_message ON marketplace_chat_drafts (tg_message_id) WHERE tg_message_id IS NOT NULL;
