import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildInvoicePdf } from '../../../../../lib/invoice-pdf';
import { loadInvoiceView } from '../../../../../lib/invoice-buyer';
import { SELLER } from '../../../../../lib/company';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Публічне завантаження PDF-рахунку. Доступ за unguessable UUID — та сама модель,
// що й сторінка /invoice/[id], яку клієнт відкриває за посиланням; нових даних
// понад те, що вже видно на сторінці, роут не розкриває.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: order, error } = await db.from('orders').select('*').eq('id', id).single();
  if (error || !order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
    signatoryName: SELLER.signatory,
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
