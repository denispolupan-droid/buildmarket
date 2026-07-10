-- Brand logos. `brand` stays a free-text field on products (no FK, no products migration) —
-- this is just a side lookup table keyed by that same brand string, matched case-insensitively
-- by the app layer, so a logo can be attached without normalizing brand into its own entity.
CREATE TABLE IF NOT EXISTS brand_logos (
  brand_name TEXT PRIMARY KEY,
  logo_url   TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
