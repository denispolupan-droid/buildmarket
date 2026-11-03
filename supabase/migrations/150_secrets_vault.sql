-- 150: токени інтеграцій — у Supabase Vault (аудит 31.10.2026, §5 Medium / п. 14).
--
-- Було: ключі НП, Prom, Rozetka (пароль і токен), Епіцентру, RZ-доставки, Monobank,
-- NovaPay (refresh-токен і сертифікат), Google Ads — відкритим текстом в
-- app_settings: їх читає будь-який серверний запит до таблиці і вони лягають у
-- кожен дамп. Vault шифрує значення на диску й у бекапах; доступ — лише через
-- три SECURITY DEFINER-функції нижче (EXECUTE у anon/authenticated відкликано,
-- secdef-guard це перевіряє щодня).
--
-- Код читає/пише через lib/secrets (readSetting/writeSetting/deleteSetting), і для
-- секретних ключів іде сюди. Перенесення значень: копіюємо з app_settings у Vault,
-- САМІ рядки app_settings НЕ видаляємо — старий код на проді ще читає їх, поки
-- не деплоїться новий; після деплою значення з app_settings прибирає
-- scripts/purge-app-settings-secrets.ts (окремий крок, свідомо).

create or replace function public.secret_get(p_name text)
returns text
language sql
security definer
set search_path to ''
as $$
  select s.decrypted_secret from vault.decrypted_secrets s where s.name = p_name limit 1;
$$;

create or replace function public.secret_set(p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
begin
  if p_name is null or p_name = '' then raise exception 'secret_set: empty name'; end if;
  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then
    perform vault.create_secret(p_value, p_name, 'app secret (lib/secrets)');
  else
    perform vault.update_secret(v_id, p_value, p_name, 'app secret (lib/secrets)');
  end if;
end;
$$;

create or replace function public.secret_delete(p_name text)
returns void
language sql
security definer
set search_path to ''
as $$
  delete from vault.secrets where name = p_name;
$$;

revoke execute on function public.secret_get(text) from public, anon, authenticated;
revoke execute on function public.secret_set(text, text) from public, anon, authenticated;
revoke execute on function public.secret_delete(text) from public, anon, authenticated;
grant execute on function public.secret_get(text), public.secret_set(text, text), public.secret_delete(text) to service_role;

-- Перенесення наявних значень (рядки app_settings лишаються до деплою коду).
do $$
declare r record;
begin
  for r in
    select key, value from public.app_settings
    where key in (
      'np_api_key', 'prom_api_token', 'rozetka_password', 'rozetka_token', 'rozetka_api_token',
      'rozetkapay_api_password', 'epicentr_api_token',
      'rz_delivery_token', 'mono_personal_token', 'mono_webhook_secret',
      'novapay_refresh_token', 'novapay_refresh_token_prev', 'novapay_certificate', 'novapay_certificate_prev', 'novapay_jwt',
      'google_ads_client_secret', 'google_ads_developer_token', 'google_ads_refresh_token'
    ) and value is not null and btrim(value) <> ''
  loop
    perform public.secret_set(r.key, r.value);
  end loop;
end $$;

-- PostgREST має побачити нові функції одразу (інакше перші виклики rpc — 404 PGRST202,
-- поки кеш схеми не оновиться сам).
notify pgrst, 'reload schema';
