-- 159: order_deal_costs — друге джерело: комісія банку за еквайринг (Monobank).
--
-- Кожне «Покриття за проведені трансакції … Комісія банку N грн» у виписці Mono —
-- одна карткова оплата на сайті. Проводка acq-fee:{id} (lib/mono-ingest) лягає
-- без order_id (252,42 ₴ за 07–11.2026). Розбивка — на замовлення з номером у
-- призначенні або, без номера, на єдине карткове замовлення з тією ж сумою за 3 дні
-- (lib/deal-costs.allocateAcquiringFee). Поповнення балансу дропшипера — не
-- замовлення, лишається «без замовлення». Леджер не змінюється.

alter table public.order_deal_costs drop constraint if exists order_deal_costs_source_check;
alter table public.order_deal_costs add constraint order_deal_costs_source_check
  check (source in ('rzpay_fee', 'acquiring_fee'));

-- payment — уся комісія одного платежу на одне замовлення
alter table public.order_deal_costs drop constraint if exists order_deal_costs_method_check;
alter table public.order_deal_costs add constraint order_deal_costs_method_check
  check (method in ('register', 'proportional', 'payment'));
