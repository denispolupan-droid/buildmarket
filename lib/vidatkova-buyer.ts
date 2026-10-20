// Реквізити покупця для видаткової накладної.
//
// Раніше всі три рендерери (сторінка, PDF, email) брали покупця тільки з
// замовлення (company || contact + телефон) — юридичні реквізити з картки
// контрагента (юр. назва, ІПН/ЄДРПОУ, адреса) в документ не потрапляли,
// хоча ФОП/ТОВ-покупцям оригінал потрібен саме з ними.

import type { SupabaseClient } from '@supabase/supabase-js';

export type VidatkovaBuyer = {
  name: string;
  edrpou: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  orderNumber: number | null;
  /** «Посада ПІБ» керівника з картки контрагента — у рядок «Отримав(ла)». */
  signatory: string | null;
};

export async function resolveVidatkovaBuyer(
  db: SupabaseClient,
  doc: { order_id?: string | null; customer_id?: string | null; counterparty?: string | null },
): Promise<VidatkovaBuyer> {
  let order: { company: string | null; contact: string; phone: string | null; email: string | null; order_number: number; customer_id: string | null } | null = null;
  if (doc.order_id) {
    const { data } = await db
      .from('orders')
      .select('company, contact, phone, email, order_number, customer_id')
      .eq('id', doc.order_id)
      .maybeSingle();
    order = data ?? null;
  }

  const customerId = doc.customer_id ?? order?.customer_id ?? null;
  let customer: { name: string | null; company: string | null; legal_name: string | null; tax_number: string | null; address: string | null; legal_address: string | null; city: string | null; signatory_name: string | null; signatory_position: string | null } | null = null;
  if (customerId) {
    const { data } = await db
      .from('customers')
      .select('name, company, legal_name, tax_number, address, legal_address, city, signatory_name, signatory_position')
      .eq('id', customerId)
      .maybeSingle();
    customer = data ?? null;
  }

  return {
    name: customer?.legal_name
      || customer?.company
      || order?.company
      || customer?.name
      || order?.contact
      || doc.counterparty
      || '—',
    edrpou:  customer?.tax_number ?? null,
    address: customer?.legal_address || customer?.address || customer?.city || null,
    phone:   order?.phone ?? null,
    email:   order?.email ?? null,
    orderNumber: order?.order_number ?? null,
    // Посада без ПІБ нічого не дає — підставляємо лише коли є прізвище.
    signatory: customer?.signatory_name?.trim()
      ? [customer.signatory_position?.trim(), customer.signatory_name.trim()].filter(Boolean).join(' ')
      : null,
  };
}
