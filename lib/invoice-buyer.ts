// Єдине джерело правди для рахунку (preview / PDF / Excel / email): блок «Покупець»
// та опції відображення (що показувати). Керується прапорцем invoice_as_company і
// JSON invoice_options на замовленні (див. міграції 069/070).
//
// За замовчуванням покупець — фізособа (order.contact). Якщо ввімкнено підприємство,
// реквізити беруться з картки контрагента (customers): юр.назва, ЄДРПОУ/ІПН, юр.адреса.
import type { SupabaseClient } from '@supabase/supabase-js';

export type InvoiceBuyer = {
  name: string;
  edrpou: string | null;
  address: string | null;
  /** Контактна особа — другим рядком; ховається, коли show_contact вимкнено. */
  contactPerson: string | null;
  phone: string | null;
};

export type InvoiceOptions = {
  asCompany: boolean;
  showContact: boolean;   // контактна особа + телефон у блоці «Покупець»
  showDelivery: boolean;  // рядок «Адреса доставки»
  showTerms: boolean;     // рядок «Строк оплати»
};

export type InvoiceView = {
  buyer: InvoiceBuyer;
  showDelivery: boolean;
  showTerms: boolean;
};

type OrderLike = {
  invoice_as_company?: boolean | null;
  invoice_options?: Record<string, unknown> | null;
  company?: string | null;
  contact: string;
  phone?: string | null;
  customer_id?: string | null;
};

type CustomerReq = {
  company?: string | null;
  legal_name?: string | null;
  tax_number?: string | null;
  legal_address?: string | null;
} | null | undefined;

/** Обчислює опції відображення з дефолтами (для юр. рахунку контакт за замовчуванням прихований). */
export function resolveInvoiceOptions(order: OrderLike): InvoiceOptions {
  const asCompany = !!order.invoice_as_company;
  const o = (order.invoice_options ?? {}) as Record<string, boolean | undefined>;
  return {
    asCompany,
    showContact:  o.show_contact  ?? !asCompany,
    showDelivery: o.show_delivery ?? true,
    showTerms:    o.show_terms    ?? true,
  };
}

export function resolveInvoiceBuyer(order: OrderLike, customer: CustomerReq, showContact?: boolean): InvoiceBuyer {
  const asCompany = !!order.invoice_as_company;
  const withContact = showContact ?? !asCompany;
  const company = asCompany ? (customer?.legal_name || customer?.company || order.company || null) : null;

  if (company) {
    return {
      name:          company,
      edrpou:        customer?.tax_number ?? null,
      address:       customer?.legal_address ?? null,
      contactPerson: withContact ? (order.contact || null) : null,
      phone:         withContact ? (order.phone ?? null) : null,
    };
  }

  // Фізособа.
  return {
    name:          order.company || order.contact,
    edrpou:        null,
    address:       null,
    contactPerson: withContact && order.company && order.contact !== order.company ? order.contact : null,
    phone:         withContact ? (order.phone ?? null) : null,
  };
}

/** Дотягує картку контрагента (лише для юр. рахунку) і повертає покупця + опції рядків. */
export async function loadInvoiceView(db: SupabaseClient, order: OrderLike): Promise<InvoiceView> {
  const opts = resolveInvoiceOptions(order);
  let customer: CustomerReq = null;
  if (opts.asCompany && order.customer_id) {
    const { data } = await db
      .from('customers')
      .select('company, legal_name, tax_number, legal_address')
      .eq('id', order.customer_id)
      .maybeSingle();
    customer = data as CustomerReq;
  }
  return {
    buyer:        resolveInvoiceBuyer(order, customer, opts.showContact),
    showDelivery: opts.showDelivery,
    showTerms:    opts.showTerms,
  };
}
