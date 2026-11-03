-- 154: uq_money_entries_sale_shipment — лише для проводки виручки (shipment:*).
--
-- Індекс (прод, без міграції; тест отримав його 03.11 через 151) забороняв
-- БУДЬ-ЯКИЙ другий додатний рядок customer для того самого doc_id. Але сторно
-- законно пише такі рядки з тим самим doc_id:
--   • скасування проведеного дропшип-продажу обертає залік балансу партнера
--     (reversal:<txn>): customer −674.5 → +674.5 поруч із +674.5 «Відвантаження»;
--   • скасування КБ (debt-adj-rev:*) обертає перенесення: +сума для другої сторони.
-- На тесті індексу не було, тому інтеграційні тести це не ловили; після 151
-- впали обидва кейси — і в проді ці скасування падали б з «duplicate key».
--
-- Мета індексу (аудит 31.10, C2) — не задвоїти ВИРУЧКУ по одній РН: ключі
-- shipment:<doc> і legacy shipment:payment-type:<id>. Звужуємо предикат до них.

DROP INDEX IF EXISTS uq_money_entries_sale_shipment;
CREATE UNIQUE INDEX uq_money_entries_sale_shipment
  ON public.money_entries (doc_id)
  WHERE doc_id IS NOT NULL
    AND account_type = 'customer'
    AND amount > 0
    AND idempotency_key LIKE 'shipment:%';
