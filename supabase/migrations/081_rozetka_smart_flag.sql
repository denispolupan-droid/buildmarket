-- Rozetka Smart: товар підключено до програми «Єдина підписка Smart».
-- Фід автоматично додає до ціни надбавку, що покриває компенсацію доставки
-- (12/18/30 грн за порогами суми) з урахуванням комісії на саму надбавку.
-- Прапор ставиться скриптом за економічним відбором (див. scratchpad
-- smart-economics.mjs 2026-07-26) і синхронізується вручну з кабінетом.
ALTER TABLE products ADD COLUMN IF NOT EXISTS rozetka_smart BOOLEAN NOT NULL DEFAULT false;
