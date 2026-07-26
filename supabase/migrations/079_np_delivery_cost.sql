-- Вартість доставки НП та платник по відправленню (з TrackingDocument.getStatusDocuments:
-- DocumentCost / PayerType). Якщо платник Sender — це витрата продавця, проводиться в
-- money_entries (logistics, doc_type='delivery_cost') при доставці. Для Recipient —
-- лише довідково (платить покупець).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS np_delivery_cost  numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS np_delivery_payer text;
