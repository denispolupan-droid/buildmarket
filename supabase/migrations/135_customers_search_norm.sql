-- Те саме, що міграції 133 і 134 зробили для orders, але для customers: вибір
-- клієнта у формі замовлення і вибір партнера в «Коригуванні боргу» шукали по
-- сирих полях, тож мали ті самі дві мини.
--
-- Телефон: 432 записи — самі цифри, 143 — з плюсом, 6 — з роздільниками
-- («+38 (099) 020-79-54»). Останні не знаходились за суцільним набором.
-- Ім'я: 334 клієнти записані українською, решта російською — «Меркулов Андрей»
-- поруч із «Наградська Зінаїда Миколаївна». Згортання орфографії зводить
-- і/и/ы, є/е/э/ё, ґ/г, знімає ' ’ ` - ь ъ; корені імен (Олександр/Александр)
-- лишаються на боці запиту — lib/name-search.
--
-- Вирази мусять збігатися з orders (міграції 133/134) і з fold() у коді:
-- рядки translate() звіряти посимвольно, зсув на позицію колись перетворив
-- «Сысоев» на «сесоев».
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS phone_digits TEXT
  GENERATED ALWAYS AS (regexp_replace(COALESCE(phone, ''), '\D', '', 'g')) STORED;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS name_norm TEXT
  GENERATED ALWAYS AS (translate(lower(COALESCE(name, '')), 'іїыёэєґ''’`-ьъ', 'иииееег')) STORED;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS company_norm TEXT
  GENERATED ALWAYS AS (translate(lower(COALESCE(company, '')), 'іїыёэєґ''’`-ьъ', 'иииееег')) STORED;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS legal_name_norm TEXT
  GENERATED ALWAYS AS (translate(lower(COALESCE(legal_name, '')), 'іїыёэєґ''’`-ьъ', 'иииееег')) STORED;

COMMENT ON COLUMN customers.phone_digits IS 'Телефон без роздільників — для пошуку';
COMMENT ON COLUMN customers.name_norm IS 'name зі згорнутою орфографією — для пошуку; див. lib/name-search.fold';
COMMENT ON COLUMN customers.company_norm IS 'company зі згорнутою орфографією — для пошуку';
COMMENT ON COLUMN customers.legal_name_norm IS 'legal_name зі згорнутою орфографією — для пошуку';
