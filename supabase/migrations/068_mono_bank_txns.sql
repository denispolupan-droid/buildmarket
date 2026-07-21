-- Аудит + дедуплікація вхідних транзакцій з виписки Monobank (Personal/ФОП API).
-- Кожна транзакція банку зберігається рівно раз (id = mono txn id), що робить
-- вебхук і крон-реконсиляцію ідемпотентними: обидва можуть побачити ту саму
-- операцію, але оброблена вона буде один раз. Незіставлені (виплати маркетплейсів,
-- поповнення) лежать тут для ручної сверки; зіставлені — прив'язані до замовлення.
create table if not exists mono_bank_txns (
  id             text primary key,               -- id транзакції Monobank
  account        text,                            -- id рахунку (ФОП)
  txn_time       timestamptz,
  amount         numeric not null,                -- грн, лише надходження (>0)
  comment        text,                            -- призначення платежу (містить №замовлення)
  description    text,
  counter_name   text,
  counter_edrpou text,
  counter_iban   text,
  status         text not null default 'unmatched'  -- matched | unmatched
                 check (status in ('matched', 'unmatched')),
  matched_order_id  uuid references orders(id),
  order_payment_id  uuid,                          -- id рядка order_payments (якщо проведено)
  raw            jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists mono_bank_txns_status_idx on mono_bank_txns(status);
create index if not exists mono_bank_txns_order_idx  on mono_bank_txns(matched_order_id);
create index if not exists mono_bank_txns_time_idx   on mono_bank_txns(txn_time desc);
