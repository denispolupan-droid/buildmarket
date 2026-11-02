-- 149: дрібні знахідки аудиту 31.10.2026 (розділи 2–5), закриті 02.11.2026.
--
-- 1. order_status_history.changed_by був NULL у всіх 2165 рядках: тригер читав
--    current_setting('app.current_user'), яку код через PostgREST поставити не
--    може (кожен запит — своя транзакція). Тепер автора несе колонка
--    orders.status_changed_by: buildStatusPatch (lib/orders/status) пише її тим
--    самим UPDATE, що й статус, а тригер бере її, коли налаштування порожнє.
-- 2. UNIQUE acc_documents(doc_type, doc_number): два документи з одним номером
--    зробили б звірку і друк неоднозначними. Дублів на проді немає (02.11).
-- 3. Складений індекс acc_documents(doc_type, status, doc_date) — списки
--    документів і звіти фільтрують саме так.
-- 4. Дубль індексу product_characteristics(product_sku): idx_chars_sku повторює
--    product_characteristics_product_sku_idx.
-- 5. Політики partner_read_own: auth.uid() у підзапиті обгорнуто в (select …),
--    щоб планувальник обчислював його раз на запит, а не на кожен рядок.
-- 6. next_doc_number: LPAD(n, 4, '0') не лише доповнює, а й ОБРІЗАЄ до 4 знаків —
--    з 10000-го документа року номери знову починались би з «1000» і збігалися
--    з наявними (знайшов індекс із п. 2 на тестовій базі, де лічильник продажів
--    уже 10747). Доповнюємо до 4, довші лишаємо як є: РН-2026-0001 … РН-2026-10000.

alter table public.orders add column if not exists status_changed_by text;
comment on column public.orders.status_changed_by is
  'Хто востаннє змінив статус (email або «system»/«cron»); тригер копіює в order_status_history.changed_by';

create or replace function public.fn_track_order_status()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if old.status is distinct from new.status then
    insert into order_status_history (order_id, status_from, status_to, changed_by)
    values (new.id::uuid, old.status, new.status,
            coalesce(nullif(current_setting('app.current_user', true), ''), new.status_changed_by));
  end if;
  return new;
end;
$function$;

create or replace function public.next_doc_number(p_type text)
returns text
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_year   int;
  v_num    int;
  v_prefix text;
begin
  v_year := extract(year from now())::int;

  update acc_doc_sequences
  set last_number = 0, year = v_year
  where doc_type = p_type and year < v_year;

  update acc_doc_sequences
  set last_number = last_number + 1
  where doc_type = p_type
  returning last_number, prefix into v_num, v_prefix;

  if not found then
    raise exception 'Unknown doc_type: %', p_type;
  end if;

  return v_prefix || '-' || v_year || '-' || lpad(v_num::text, greatest(4, length(v_num::text)), '0');
end;
$function$;

create unique index if not exists uq_acc_documents_type_number
  on public.acc_documents (doc_type, doc_number)
  where doc_number is not null;

create index if not exists idx_acc_documents_type_status_date
  on public.acc_documents (doc_type, status, doc_date);

drop index if exists public.idx_chars_sku;

drop policy if exists partner_read_own on public.partner_balance_transactions;
create policy partner_read_own on public.partner_balance_transactions
  for select to public
  using (customer_id = (select c.id from public.customers c where c.auth_user_id = (select auth.uid())));

drop policy if exists partner_read_own on public.partner_payout_requests;
create policy partner_read_own on public.partner_payout_requests
  for select to public
  using (customer_id = (select c.id from public.customers c where c.auth_user_id = (select auth.uid())));
