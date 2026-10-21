import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { SELLER, SELLER_SIGNER, sellerTaxStatus } from '../../../lib/company';
import { invoiceDate, invoicePurpose, invoiceQrMatrix } from '../../../lib/invoice-doc';
import { nbuQrSvg } from '../../../lib/nbu-qr';
import { loadInvoiceView } from '../../../lib/invoice-buyer';
import { createSupabaseServer } from '../../../lib/supabase-server';
import InvoicePrint from './InvoicePrint';
import LinesEditor from '../../components/admin/LinesEditor';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: order } = await serviceClient
    .from('orders')
    .select('*')
    .eq('id', id)
    .single();

  if (!order) redirect('/');

  const { buyer, showDelivery, showTerms } = await loadInvoiceView(serviceClient, order);

  // Сторінка публічна (UUID = секрет у посиланні), але робочі кнопки
  // (Email/Excel/месенджери/друк) бачить лише персонал — клієнту лишаємо PDF.
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const isStaff = ['admin', 'manager'].includes(user?.app_metadata?.role ?? '');

  // Правка позицій — рівно тим самим редактором, що й у видатковій, і тим
  // самим PATCH замовлення: він уже синхронізує рядки РН-чернетки й перераховує
  // комісію маркетплейсу. Тому рахунок і накладна не розходяться самі собою.
  const isAdmin = user?.app_metadata?.role === 'admin';
  const editableItems = ((order.items ?? []) as { sku: string; name?: string; brand?: string | null; qty: number; price: number }[])
    .filter(i => i?.sku)
    .map(i => ({
      sku: i.sku,
      name: [i.brand, i.name].filter(Boolean).join(' ').trim() || i.sku,
      qty: Number(i.qty),
      price: Number(i.price ?? 0),
    }));

  // Дата, призначення і QR — на сервері: QR-генератор не тягнемо в клієнтський бандл.
  const docDate = invoiceDate(order);
  const qr = invoiceQrMatrix(order);

  // UUID is unguessable — anyone with the link can view the invoice
  return (
    <InvoicePrint
      isStaff={isStaff}
      editor={isAdmin && editableItems.length > 0 ? (
        <LinesEditor
          target={{ kind: 'order', orderId: order.id }}
          docDate={order.created_at}
          initial={editableItems}
          title="Редагування рахунку"
          hint="Правки йдуть у замовлення — і рахунок, і видаткова візьмуть їх звідти."
        />
      ) : null}
      order={order}
      buyer={buyer}
      showDelivery={showDelivery}
      showTerms={showTerms}
      bankRecipient={SELLER.name}
      bankIban={SELLER.iban}
      bankName={SELLER.bank}
      bankEdrpou={SELLER.edrpou}
      bankAddress={SELLER.address}
      signer={SELLER_SIGNER}
      docDate={docDate}
      purpose={invoicePurpose(order)}
      sellerTaxStatus={sellerTaxStatus(docDate)}
      qrSvg={qr ? nbuQrSvg(qr) : null}
    />
  );
}
