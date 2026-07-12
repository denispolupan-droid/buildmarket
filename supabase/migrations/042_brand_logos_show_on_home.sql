-- Lets an admin opt a brand into the homepage carousel / About page grid
-- straight from the "Логотипи брендів" modal, without touching lib/brands.ts.
ALTER TABLE brand_logos
  ADD COLUMN IF NOT EXISTS show_on_home BOOLEAN NOT NULL DEFAULT false;
