-- Tracks when Nova Poshta actually accepted a shipped order's parcel (vs. just having a TTN
-- created for it). status = 'shipped' already covers a lot of downstream logic (reservation
-- release, accounting entries, marketplace status push) and shouldn't be redefined — this is a
-- purely additive signal surfaced in the admin UI and used to upgrade Rozetka's status from
-- 61 (scheduled handover) to 3 (handed to delivery service) once confirmed.
alter table orders add column if not exists carrier_accepted_at timestamptz;
