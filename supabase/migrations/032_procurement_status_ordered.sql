-- Add 'ordered' status: document conducted but email not yet sent to supplier
ALTER TABLE acc_documents DROP CONSTRAINT IF EXISTS acc_documents_procurement_status_check;
ALTER TABLE acc_documents ADD CONSTRAINT acc_documents_procurement_status_check
  CHECK (procurement_status IS NULL OR procurement_status IN (
    'draft', 'ordered', 'sent', 'confirmed_by_supplier',
    'partially_received', 'received', 'invoiced', 'paid', 'cancelled'
  ));
