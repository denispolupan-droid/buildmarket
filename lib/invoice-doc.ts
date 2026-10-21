// Спільне для рахунку на всіх носіях (сторінка, PDF, лист): дата документа за
// Києвом, призначення платежу і QR-код НБУ. Призначення в тексті рахунку й у
// QR — один рядок звідси: Правила НБУ вимагають, щоб вони збігалися.

import { SELLER } from './company';
import { kyivDate, formatShortDate } from './doc-format';
import { buildNbuQrMatrix, buildNbuQrUrl, type NbuQrMatrix } from './nbu-qr';

type InvoiceOrder = { order_number: number; created_at: string; total_price: number; amount_paid?: number | null };

/**
 * Скільки лишилось сплатити: повна сума рахунку мінус уже зараховані оплати.
 * Саме ця сума йде і в «Сума до сплати», і в QR — Правила НБУ вимагають,
 * щоб текст рахунку і QR збігалися.
 */
export function invoiceAmountDue(order: Pick<InvoiceOrder, 'total_price' | 'amount_paid'>): number {
  const due = Number(order.total_price) - Number(order.amount_paid ?? 0);
  return due > 0.009 ? Math.round(due * 100) / 100 : 0;
}

/** Дата рахунку — календарна дата створення замовлення в Києві («2026-10-20»). */
export function invoiceDate(order: Pick<InvoiceOrder, 'created_at'>): string {
  return kyivDate(order.created_at);
}

export function invoicePurpose(order: Pick<InvoiceOrder, 'order_number' | 'created_at'>): string {
  return `Оплата за замовлення №${order.order_number} від ${formatShortDate(invoiceDate(order))}. Без ПДВ.`;
}

/** Матриця QR для оплати залишку за рахунком; null — якщо платити нічого або дані не влазять. */
export function invoiceQrMatrix(order: InvoiceOrder): NbuQrMatrix | null {
  const amount = invoiceAmountDue(order);
  if (!(amount > 0) || !SELLER.iban || !SELLER.edrpou) return null;
  try {
    return buildNbuQrMatrix(buildNbuQrUrl({
      recipient: SELLER.name,
      iban: SELLER.iban,
      amount,
      recipientCode: SELLER.edrpou,
      purpose: invoicePurpose(order),
    }));
  } catch {
    return null;
  }
}
