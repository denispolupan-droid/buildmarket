-- ============================================================================
-- 069  Per-order flag: issue the invoice to a company (juridical) buyer
-- ============================================================================
-- Marketplace/retail orders default to an individual buyer. When the client asks
-- for a рахунок на підприємство, staff flip this flag and the invoice pulls the
-- buyer's requisites (company/legal name, ЄДРПОУ/ІПН, legal address) from the
-- linked contractor card (customers.legal_name/tax_number/legal_address) instead
-- of showing the individual contact.
-- ============================================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_as_company boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN orders.invoice_as_company IS
  'Виставляти рахунок на підприємство — реквізити покупця беруться з картки контрагента (customers.legal_name/tax_number/legal_address).';
