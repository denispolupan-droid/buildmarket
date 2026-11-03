import { NextRequest, NextResponse } from 'next/server';
import { buildInvoicePdf } from '../../../../../lib/invoice-pdf';
import { loadInvoiceView } from '../../../../../lib/invoice-buyer';
import { SELLER, SELLER_SIGNER } from '../../../../../lib/company';
import { createServiceClient } from '../../../../../lib/supabase-service';
import type { InvoiceOrderRow } from '../../../../../lib/invoice-doc';
import { withApi } from '../../../../../lib/api-handler';

const db = createServiceClient();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Публічне завантаження PDF-рахунку. Доступ за unguessable UUID — та сама модель,
// що й сторінка /invoice/[id], яку клієнт відкриває за посиланням; нових даних
// понад те, що вже видно на сторінці, роут не розкриває.
async function _GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: orderRow, error } = await db.from('orders').select('*').eq('id', id).single();
  if (error || !orderRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const order = orderRow as InvoiceOrderRow<typeof orderRow>;

  const { buyer, showDelivery, showTerms } = await loadInvoiceView(db, order);

  const pdf = await buildInvoicePdf({
    order,
    buyer,
    showDelivery,
    showTerms,
    bankRecipient: SELLER.name,
    bankIban:      SELLER.iban,
    bankName:      SELLER.bank,
    bankEdrpou:    SELLER.edrpou,
    bankAddress:   SELLER.address,
    signer:        SELLER_SIGNER,
  });

  const asciiName = `FIXLINE_invoice_${order.order_number}.pdf`;
  const utf8Name  = encodeURIComponent(`Рахунок_${order.order_number}.pdf`);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
      'Cache-Control': 'private, no-store',
    },
  });
}

export const GET = withApi('invoice/[id]/pdf', _GET);
