-- 146: B2B-реєстрація лише після схвалення (рішення власника 01.11.2026).
--
-- Було (055): тип акаунта, обраний при реєстрації (dealer / contractor /
-- shop_owner / dropship / wholesale), тригер одразу копіював у app_metadata —
-- будь-хто за хвилину отримував оптові й дроп-ціни всього каталогу.
--
-- Тепер для B2B-типів тригер кладе вибір у app_metadata.requested_account_type
-- зі статусом b2b_status = 'pending', а account_type лишає 'retail'. Ролі в
-- коді (lib/user-role getRole) і далі читають лише account_type, тож доступ до
-- оптових цін з'являється тільки після схвалення адміном
-- (/api/admin/b2b-requests → account_type = requested, створення контрагента).
-- Наявні акаунти не змінюються: тригер спрацьовує лише на INSERT.

create or replace function public.guard_user_metadata()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_type text;
begin
  -- role ніколи не читається з user_metadata (055)
  if new.raw_user_meta_data ? 'role' then
    new.raw_user_meta_data := new.raw_user_meta_data - 'role';
  end if;

  if tg_op = 'INSERT' and new.raw_user_meta_data ? 'account_type' then
    v_type := new.raw_user_meta_data ->> 'account_type';
    if v_type in ('dealer', 'contractor', 'shop_owner', 'wholesale', 'dropship') then
      new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object(
             'account_type',           'retail',
             'requested_account_type', v_type,
             'b2b_status',             'pending',
             'b2b_requested_at',       to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    else
      new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('account_type', v_type);
    end if;
  end if;

  return new;
end
$function$;

-- Виконання лише для тригера (059): EXECUTE для клієнтських ролей закритий
revoke execute on function public.guard_user_metadata() from public, anon, authenticated;
