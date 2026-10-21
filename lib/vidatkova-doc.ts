// Дані видаткової накладної для всіх трьох рендерерів (сторінка, PDF, лист):
// документ, рядки з назвами й одиницями виміру, покупець, договір.
// Раніше кожен роут вибирав це сам — і копії почали б розходитися.

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveVidatkovaBuyer, type VidatkovaBuyer } from './vidatkova-buyer';
import { SELLER, SELLER_SIGNER, sellerTaxStatus } from './company';
import type { Signer } from './signatory';

export type VidatkovaLine = { sku: string; name: string; qty: number; unit: string; price: number };

export type VidatkovaDoc = {
  id: string;
  doc_number: string;
  doc_date: string;
  status: string;
  order_id: string | null;
  customer_id: string | null;
  counterparty: string | null;
  contract_id: string | null;
};

export type VidatkovaData = {
  doc: VidatkovaDoc;
  lines: VidatkovaLine[];
  total: number;
  buyer: VidatkovaBuyer;
  /** «№ … від …» — лише для договору, укладеного вручну (авто-договори — технічні). */
  contract: string | null;
};

/** null — документа немає або це не видаткова (doc_type ≠ sale). */
export async function loadVidatkova(db: SupabaseClient, id: string): Promise<VidatkovaData | null> {
  const [{ data: doc }, { data: rawLines }] = await Promise.all([
    db.from('acc_documents')
      .select('id, doc_number, doc_date, doc_type, status, order_id, customer_id, counterparty, contract_id')
      .eq('id', id).maybeSingle(),
    db.from('acc_document_lines')
      .select('id, sku, qty, price, uom_code, sort_order')
      .eq('document_id', id).order('sort_order').order('id'),
  ]);
  if (!doc || doc.doc_type !== 'sale') return null;

  const lines = (rawLines ?? []) as Array<{ sku: string; qty: number; price: number | null; uom_code: string | null }>;
  const skus = lines.map(l => l.sku).filter(Boolean);
  const uomCodes = [...new Set(lines.map(l => l.uom_code).filter((c): c is string => !!c))];

  const [{ data: products }, { data: uoms }, buyer, contract] = await Promise.all([
    skus.length
      ? db.from('products').select('sku, name, brand').in('sku', skus)
      : Promise.resolve({ data: [] as Array<{ sku: string; name: string; brand: string | null }> }),
    uomCodes.length
      ? db.from('uom').select('code, name_short').in('code', uomCodes)
      : Promise.resolve({ data: [] as Array<{ code: string; name_short: string }> }),
    resolveVidatkovaBuyer(db, doc),
    resolveContract(db, doc.contract_id),
  ]);

  const nameMap = new Map((products ?? []).map(p => [p.sku, `${p.brand ?? ''} ${p.name}`.trim()]));
  const uomMap = new Map((uoms ?? []).map(u => [u.code, u.name_short]));

  const printLines = lines.map(l => ({
    sku: l.sku,
    name: nameMap.get(l.sku) || l.sku,
    qty: Number(l.qty),
    unit: (l.uom_code && uomMap.get(l.uom_code)) || 'шт.',
    price: Number(l.price ?? 0),
  }));
  const total = Math.round(printLines.reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100;

  return { doc, lines: printLines, total, buyer, contract };
}

/** Спільні параметри всіх трьох рендерерів (сторінка, PDF, лист). */
export type VidatkovaRenderParams = {
  docNumber: string;
  docDate: string;
  lines: VidatkovaLine[];
  total: number;
  sellerName: string;
  sellerEdrpou: string;
  sellerAddress: string;
  sellerCity?: string;
  sellerBank: string;
  sellerIban: string;
  sellerTaxStatus: string;
  buyerName: string;
  buyerPhone?: string | null;
  buyerEdrpou?: string | null;
  buyerAddress?: string | null;
  orderNumber?: number | null;
  contract?: string | null;
  sellerSigner?: Signer | null;
  buyerSigner?: Signer | null;
};

export function vidatkovaRenderParams(data: VidatkovaData): VidatkovaRenderParams {
  const { doc, lines, total, buyer, contract } = data;
  return {
    docNumber:       doc.doc_number,
    docDate:         doc.doc_date,
    lines,
    total,
    sellerName:      SELLER.name,
    sellerEdrpou:    SELLER.edrpou,
    sellerAddress:   SELLER.address,
    sellerCity:      SELLER.city,
    sellerBank:      SELLER.bank,
    sellerIban:      SELLER.iban,
    sellerTaxStatus: sellerTaxStatus(doc.doc_date),
    buyerName:       buyer.name,
    buyerPhone:      buyer.phone,
    buyerEdrpou:     buyer.edrpou,
    buyerAddress:    buyer.address,
    orderNumber:     buyer.orderNumber,
    contract,
    sellerSigner:    SELLER_SIGNER,
    buyerSigner:     buyer.signer,
  };
}

async function resolveContract(db: SupabaseClient, contractId: string | null): Promise<string | null> {
  if (!contractId) return null;
  const { data } = await db
    .from('customer_contracts')
    .select('contract_number, start_date, is_auto')
    .eq('id', contractId)
    .maybeSingle();
  if (!data || data.is_auto) return null;
  const [y, m, d] = String(data.start_date).slice(0, 10).split('-');
  return `№ ${data.contract_number} від ${d}.${m}.${y}`;
}
