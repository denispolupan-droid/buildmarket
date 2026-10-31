-- Ремонт 31.10.2026 (аудит): привʼязка оплат «Сплатити рахунок» (Monobank) до замовлень.
--
-- Вебхук /api/webhooks/monobank для reference `invoice_<orderId>_<ts>` писав
-- recordCustomerPayment БЕЗ order_id: кредит лягав на покупця, але не на
-- замовлення. Загальне сальдо покупців = 0, а в розрізі замовлення 12 замовлень
-- висіли неоплаченими (#26081164, #26081186, #26091001, #26091002, #26091089,
-- #26091131, #26091219, #26091226, #26101045, #26101066, #26101086, #26101215).
-- Код виправлено (orderId у вебхуку); тут — перепривʼязка вже записаних оплат.
--
-- Проводка: DR customer(той самий покупець, без замовлення) / CR customer(той
-- самий покупець, замовлення X). Сальдо покупця, кеш балансів, прибуток і гроші
-- НЕ змінюються — лише розріз по замовленню. Ідемпотентно (relink-order:<txn>).
-- Перевірено перед запуском: закритих періодів немає; по кожному з 12 замовлень
-- відкритий борг у розрізі замовлення дорівнює саме цій оплаті (після — 0, у
-- #26101215 — −615 «отримано наперед», бо РН ще чернетка).

begin;

select public.record_money_txn_legs(
  'customer', m.counterparty_id, null, null,
  'customer', m.counterparty_id, o.id, null,
  -m.amount, date '2026-10-31', null, 'relink',
  'Привʼязка оплати Monobank до замовлення #' || o.order_number || ' (аудит 31.10.2026)',
  'relink-order:' || m.txn_id::text, 'audit-2026-10-31',
  jsonb_build_object('source_txn', m.txn_id)
)
from money_entries m
join money_entries a on a.txn_id = m.txn_id and a.idempotency_key like 'mono:invoice:%'
join orders o on o.order_number = substring(a.description from '#(\d+)')::bigint
where m.account_type = 'customer' and m.order_id is null
  and not exists (select 1 from money_entries r where r.idempotency_key = 'relink-order:' || m.txn_id::text);

commit;

-- Перевірка: має бути 12 рядків relink і 0 відкритого боргу по 11 замовленнях.
-- select count(*) from money_entries where idempotency_key like 'relink-order:%';
-- select * from check_invariants() where status <> 'OK';
