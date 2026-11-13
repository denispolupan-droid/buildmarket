/**
 * Підприємство-платник → замовлення + картка контрагента (13.11.2026).
 * Одне правило для платника з Епіцентру (lib/epicentr-sync) і кнопки
 * «Заповнити реквізити» в картці замовлення:
 *   • замовлення — company + invoice_as_company (рахунок на підприємство,
 *     lib/invoice-buyer бере реквізити з картки контрагента);
 *   • є картка з тим самим кодом — переносимо замовлення на неї
 *     (взаєморозрахунки ведуться по підприємству);
 *   • немає — дописуємо юр. назву й код у картку покупця, лише в порожні поля
 *     (ручних правок не перебиваємо; картка з іншим кодом не чіпається).
 */

import type { createServiceClient, TableUpdate } from './supabase-service';
import { log } from './log';

type Db = ReturnType<typeof createServiceClient>;

export type CompanyApplyResult = {
  /** Поля для orders (застосовує викликач — разом зі своїм патчем) */
  orderPatch: { company: string; invoice_as_company: true; customer_id?: string };
  /** Замовлення перенесено на наявну картку з цим кодом */
  linkedCustomerId: string | null;
  /** Картку покупця доповнено кодом і назвою */
  filledCustomer: boolean;
};

export async function companyForOrder(
  db: Db,
  customerId: string | null,
  company: { name: string; code: string },
): Promise<CompanyApplyResult> {
  const res: CompanyApplyResult = { orderPatch: { company: company.name, invoice_as_company: true }, linkedCustomerId: null, filledCustomer: false };
  const { data: byTax } = await db.from('customers').select('id').eq('tax_number', company.code).order('created_at').limit(1);
  const known = byTax?.[0]?.id ?? null;
  if (known) {
    if (known !== customerId) { res.orderPatch.customer_id = known; res.linkedCustomerId = known; }
    return res;
  }
  if (!customerId) return res;
  const { data: c } = await db.from('customers').select('company, legal_name, tax_number').eq('id', customerId).maybeSingle();
  if (!c || c.tax_number) return res;
  const upd: TableUpdate<'customers'> = { tax_number: company.code };
  if (!c.legal_name) upd.legal_name = company.name;
  if (!c.company) upd.company = company.name;
  const { error } = await db.from('customers').update(upd).eq('id', customerId).is('tax_number', null);
  if (error) log.warn('customer.company_fill_failed', { customer: customerId, err: error.message });
  else res.filledCustomer = true;
  return res;
}
