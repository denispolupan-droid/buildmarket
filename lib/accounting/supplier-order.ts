/**
 * lib/accounting/supplier-order.ts
 *
 * Автоматическая отправка заказа поставщику в его Excel-формате.
 *
 * Статус: СКЕЛЕТ — заполнить после получения шаблона от поставщика.
 *
 * Как подключить:
 *   1. Получить Excel-шаблон от поставщика
 *   2. Описать его структуру в SupplierOrderTemplate (ниже)
 *   3. Заполнить buildSupplierRows() под конкретный формат
 *   4. Настроить email поставщика в suppliers.contact_person / suppliers.notes
 *      (или добавить колонку supplier_email в таблицу suppliers)
 *
 * Запуск:
 *   sendSupplierOrder({ supplierId, orderId, items })
 */

import * as XLSX from 'xlsx';
import { Resend } from 'resend';
import { createServiceClient } from '../supabase';

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Описание формата Excel поставщика ─────────────────────────────────────────
// TODO: заполнить после получения шаблона

type SupplierOrderTemplate = {
  sheetName:   string;
  startRow:    number;       // с какой строки начинаются данные (0-based)
  columns: {
    supplierSku: number;    // колонка с артикулом поставщика
    name:        number;    // колонка с названием
    qty:         number;    // колонка с количеством
    price?:      number;    // колонка с ценой (если нужна)
    comment?:    number;    // колонка с комментарием
  };
};

// Заполнить под конкретного поставщика:
const TEMPLATES: Record<string, SupplierOrderTemplate> = {
  // 'supplier-slug': {
  //   sheetName: 'Заказ',
  //   startRow: 1,
  //   columns: { supplierSku: 0, name: 1, qty: 2 },
  // },
};

// ── Основная функция ──────────────────────────────────────────────────────────

export type SendSupplierOrderInput = {
  supplier_id: number;
  order_id:    string;
  order_number: number;
  items: Array<{
    sku:          string;
    supplier_sku: string | null;
    name:         string;
    qty:          number;
    price:        number;
  }>;
  comment?: string;
};

export async function sendSupplierOrder(input: SendSupplierOrderInput): Promise<void> {
  const db = createServiceClient();

  const { data: supplier } = await db
    .from('suppliers')
    .select('id, slug, name, contact_person, contact_phone, notes')
    .eq('id', input.supplier_id)
    .single();

  if (!supplier) throw new Error(`Supplier ${input.supplier_id} not found`);

  const template = TEMPLATES[supplier.slug];
  if (!template) {
    throw new Error(
      `No Excel template configured for supplier '${supplier.slug}'. ` +
      `Add it to TEMPLATES in lib/accounting/supplier-order.ts`,
    );
  }

  // Получить email поставщика (из notes или отдельного поля когда добавим)
  const supplierEmail = extractEmail(supplier.notes ?? '');
  if (!supplierEmail) {
    throw new Error(
      `No email found for supplier '${supplier.name}'. ` +
      `Add email to suppliers.notes or add supplier_email column.`,
    );
  }

  // Строим Excel
  const xlsx = buildSupplierExcel(template, input);

  // Отправляем
  await resend.emails.send({
    from:    `BuildMarket <orders@buildmarket.com.ua>`,
    to:      supplierEmail,
    subject: `Заказ #${input.order_number} от BuildMarket`,
    html:    buildEmailHtml(supplier.name, input),
    attachments: [{
      filename: `order-${input.order_number}-${supplier.slug}.xlsx`,
      content:  xlsx.toString('base64'),
    }],
  });
}

// ── Построение Excel ──────────────────────────────────────────────────────────

function buildSupplierExcel(
  template: SupplierOrderTemplate,
  input: SendSupplierOrderInput,
): Buffer {
  const wb = XLSX.utils.book_new();
  const { columns, startRow } = template;

  // Заготовка строк (startRow пустых строк для заголовка шаблона)
  const rows: unknown[][] = Array.from({ length: startRow }, () => []);

  for (const item of input.items) {
    const row: unknown[] = [];
    row[columns.supplierSku] = item.supplier_sku ?? item.sku;
    row[columns.name]        = item.name;
    row[columns.qty]         = item.qty;
    if (columns.price   !== undefined) row[columns.price]   = item.price;
    if (columns.comment !== undefined) row[columns.comment] = input.comment ?? '';
    rows.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, template.sheetName);

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ── HTML письма ───────────────────────────────────────────────────────────────

function buildEmailHtml(supplierName: string, input: SendSupplierOrderInput): string {
  const rows = input.items
    .map(i => `<tr>
      <td>${i.supplier_sku ?? i.sku}</td>
      <td>${i.name}</td>
      <td>${i.qty}</td>
    </tr>`)
    .join('');

  return `
    <p>Добрый день, ${supplierName}!</p>
    <p>Просим оформить заказ #${input.order_number}:</p>
    <table border="1" cellpadding="4">
      <tr><th>Артикул</th><th>Название</th><th>Кол-во</th></tr>
      ${rows}
    </table>
    ${input.comment ? `<p>${input.comment}</p>` : ''}
    <p>BuildMarket</p>
  `;
}

// ── Утилиты ───────────────────────────────────────────────────────────────────

function extractEmail(text: string): string | null {
  const match = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  return match?.[0] ?? null;
}
