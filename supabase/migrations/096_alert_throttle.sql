-- Тротлінг серверних алертів у Telegram (lib/alert.ts).
--
-- Під час аварії зовнішнього API (напр., Prom 504) крон падає кожні 5 хвилин і
-- кожен прогін слав окреме 🚨 у Telegram — десятки однакових повідомлень. Тепер
-- по одному заголовку шлемо не частіше одного разу на 30 хвилин. Пам'ять процесу
-- в serverless між викликами не гарантується, тому час останнього надсилання
-- живе тут. У логи Vercel (console.error) помилка пишеться завжди, без тротлінгу.

create table if not exists alert_throttle (
  title        text primary key,
  last_sent_at timestamptz not null
);

comment on table alert_throttle is
  'Час останнього Telegram-алерту по кожному заголовку (lib/alert.ts): не частіше 1 разу на 30 хв.';

-- Доступ лише service role (політик немає — anon/authenticated відрізає RLS)
alter table alert_throttle enable row level security;
