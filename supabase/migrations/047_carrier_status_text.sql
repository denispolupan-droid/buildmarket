-- Stores Nova Poshta's live human-readable tracking status text (e.g. "Прямує до міста
-- Дніпро", "Прибув у відділення") from getStatusDocuments, so the admin order card can show
-- the parcel's actual current status instead of just the accepted/delivered milestones that
-- carrier_accepted_at already covers.
alter table orders add column if not exists carrier_status_text text;
alter table orders add column if not exists carrier_status_synced_at timestamptz;
