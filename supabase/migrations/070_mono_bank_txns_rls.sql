-- БЕЗПЕКА: увімкнути RLS на mono_bank_txns. Таблиця містить банківські дані
-- (IBAN, назви контрагентів, суми, призначення платежів) — без RLS вона була
-- читабельна через публічний anon-ключ (Supabase security advisor: ERROR
-- rls_disabled_in_public). Політик не додаємо: доступ лише через service_role
-- (bypass RLS), як у решти службових таблиць (app_settings, order_payments…).
alter table mono_bank_txns enable row level security;
