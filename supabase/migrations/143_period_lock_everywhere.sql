-- 143: «дата заборони редагування» не лише для грошей (аудит 31.10.2026, M1).
--
-- 063 закривав місяць тільки для money_entries. Склад, документи й оплати
-- закритого місяця лишались відкритими: провести/скасувати РН із датою в
-- закритому місяці, змінити її суму чи дату, додати або сторнувати оплату
-- заднім числом. Гроші при цьому падали на guard 063 — уже ПІСЛЯ того, як
-- склад був змінений (часткове проведення). Тепер той самий assert_period_open
-- стоїть на всіх трьох місцях, і склад перевіряється першим.
--
-- Межа доби — київська (doc_date — timestamptz; business_date проводок —
-- київська дата документа, див. lib/accounting/documents.ts).
-- На 31.10.2026 закритих періодів немає, тож поведінка зараз не змінюється.

create or replace function public.kyiv_date(p_ts timestamptz)
returns date
language sql
immutable
set search_path = public, pg_temp
as $$ select (p_ts at time zone 'Europe/Kyiv')::date $$;

-- Склад: рух документа з датою в закритому місяці заборонено
create or replace function public.fn_guard_closed_period_movement()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_doc_date timestamptz;
begin
  if new.document_id is not null then
    select doc_date into v_doc_date from acc_documents where id = new.document_id;
    if v_doc_date is not null then perform assert_period_open(kyiv_date(v_doc_date)); end if;
  end if;
  perform assert_period_open(kyiv_date(coalesce(new.moved_at, now())));
  return new;
end;
$$;

drop trigger if exists trg_stock_movements_period_guard on stock_movements;
create trigger trg_stock_movements_period_guard
  before insert on stock_movements
  for each row execute function fn_guard_closed_period_movement();

-- Документи: проведення / скасування / зміна дати чи суми проведеного документа
create or replace function public.fn_guard_closed_period_document()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'confirmed' then perform assert_period_open(kyiv_date(new.doc_date)); end if;
    return new;
  end if;
  if new.status is distinct from old.status
     or (old.status = 'confirmed' and (new.doc_date is distinct from old.doc_date
                                       or new.total_amount is distinct from old.total_amount
                                       or new.total_cost is distinct from old.total_cost)) then
    perform assert_period_open(kyiv_date(old.doc_date));
    perform assert_period_open(kyiv_date(new.doc_date));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_acc_documents_period_guard on acc_documents;
create trigger trg_acc_documents_period_guard
  before insert or update on acc_documents
  for each row execute function fn_guard_closed_period_document();

-- Оплати замовлень: нова оплата, сторно, зміна дати чи суми
create or replace function public.fn_guard_closed_period_payment()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform assert_period_open(new.payment_date);
  if tg_op = 'UPDATE' then
    perform assert_period_open(old.payment_date);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_order_payments_period_guard on order_payments;
create trigger trg_order_payments_period_guard
  before insert or update on order_payments
  for each row execute function fn_guard_closed_period_payment();

-- Перевірка «до першого запису» з коду проведення (lib/accounting/documents.ts):
-- партії FIFO списуються раніше, ніж вставляються рухи, тож без попередньої
-- перевірки закритий місяць ловився б уже після списання партій.
grant execute on function public.assert_period_open(date) to service_role;
