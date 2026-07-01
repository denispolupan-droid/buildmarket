-- Справочник атрибутов Прома по категориям (импортируется из XML Прома)
CREATE TABLE IF NOT EXISTS prom_attributes (
  id               SERIAL  PRIMARY KEY,
  prom_category_id BIGINT  NOT NULL,
  attribute_id     BIGINT  NOT NULL,
  name_uk          TEXT    NOT NULL,
  name_ru          TEXT,
  type             TEXT    NOT NULL CHECK (type IN ('singleselect','multiselect','real','bool')),
  measure_unit_uk  TEXT,
  val_min          NUMERIC,
  val_max          NUMERIC,
  sort_order       INT     DEFAULT 0,
  UNIQUE (prom_category_id, attribute_id)
);
CREATE INDEX IF NOT EXISTS idx_prom_attributes_cat ON prom_attributes(prom_category_id);

-- Допустимые значения для singleselect/multiselect атрибутов
CREATE TABLE IF NOT EXISTS prom_attribute_values (
  id                SERIAL PRIMARY KEY,
  prom_attribute_id INT    NOT NULL REFERENCES prom_attributes(id) ON DELETE CASCADE,
  value_id          BIGINT NOT NULL,
  name_uk           TEXT,
  name_ru           TEXT,
  sort_order        INT    DEFAULT 0,
  UNIQUE (prom_attribute_id, value_id)
);
CREATE INDEX IF NOT EXISTS idx_prom_attr_values_attr ON prom_attribute_values(prom_attribute_id);

ALTER TABLE prom_attributes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE prom_attribute_values ENABLE ROW LEVEL SECURITY;
