-- Внутрішні нотатки менеджера + швидкі прапорці на замовленні.
-- Використовуються в адмін-картці замовлення (панель «Дії»). Не впливають на облік.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS internal_note text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS flags        text[] NOT NULL DEFAULT '{}';
