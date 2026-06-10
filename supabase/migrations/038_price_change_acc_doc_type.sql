-- warehouse_id не обов'язковий для документів без фізичного руху (напр. переоцінка)
ALTER TABLE acc_documents ALTER COLUMN warehouse_id DROP NOT NULL;

-- Тип документа «Переоцінка»
INSERT INTO acc_doc_types (code, name, direction, sort_order)
VALUES ('price_change', 'Переоцінка', 'none', 90)
ON CONFLICT (code) DO NOTHING;

-- Послідовність номерів ЦН (цінові накладні)
INSERT INTO acc_doc_sequences (doc_type, prefix, last_number, year)
VALUES ('price_change', 'ЦН', 0, EXTRACT(YEAR FROM NOW())::INT)
ON CONFLICT (doc_type) DO NOTHING;
