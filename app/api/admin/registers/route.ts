import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/auth-guard';
import { createServiceClient } from '../../../../lib/supabase-service';
import { withApi } from '../../../../lib/api-handler';
import { getNpApiKey, npErrorText } from '../../../../lib/np-api';
import { withNpRetry } from '../../../../lib/np-retry';
import { buildRegisterViews, type NpDoc, type NpScanSheet, type OrderByTtn } from '../../../../lib/np-registers';

const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

const serviceClient = createServiceClient();

// Повтор при «To many requests» — через спільний withNpRetry (lib/np-retry)
async function npCall(apiKey: string, modelName: string, calledMethod: string, methodProperties: object) {
  return withNpRetry(async () => {
    const res = await fetch(NP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, modelName, calledMethod, methodProperties }),
    });
    return res.json();
  });
}

const fmtDate = (d: Date) =>
  `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;

// getDocumentList у НП НЕСТАБІЛЬНИЙ: той самий запит то повертає повний список, то
// порожній (success:true, data:[]). Тому ретраїмо, поки не отримаємо непорожній список.
// GetFullList:'1' — повний перелік (пагінований '0' пропускав документи). Повертає
// список документів за період або [] якщо НП уперто віддає порожнечу.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function npDocListWithRetry(apiKey: string, from: string, to: string, tries = 5): Promise<any[]> {
  for (let i = 0; i < tries; i++) {
    const res = await npCall(apiKey, 'InternetDocument', 'getDocumentList', {
      DateTimeFrom: from, DateTimeTo: to, GetFullList: '1', Page: '1',
    });
    const list = res.data ?? [];
    if (Array.isArray(list) && list.length > 0) return list;
    await new Promise(r => setTimeout(r, 350 * (i + 1)));
  }
  return [];
}

// Resolve TTN number → Document UUID
async function resolveTtnRef(apiKey: string, ttnNumber: string): Promise<string | null> {
  // Method 1: TrackingDocument (швидкий шлях — але Ref віддає лише для «своїх» контрактів)
  const trackRes = await npCall(apiKey, 'TrackingDocument', 'getStatusDocuments', {
    Documents: [{ DocumentNumber: ttnNumber }],
  });
  const trackRef = trackRes.data?.[0]?.Ref;
  if (trackRef) return trackRef;

  // Method 2: пошук у списку документів за 7 днів (з ретраями проти нестабільності НП)
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const list = await npDocListWithRetry(apiKey, fmtDate(weekAgo), fmtDate(today));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const found = list.find((d: any) => d.IntDocNumber === ttnNumber);
  return found?.Ref ?? null;
}

// «2026-11-03 12:57:14» → Date (локальна дата реєстру)
const sheetDate = (dt: string) => { const d = new Date((dt || '').replace(' ', 'T')); return isNaN(d.getTime()) ? new Date() : d; };
const DAY = 24 * 60 * 60 * 1000;
/** Скільки днів реєстрів показуємо з посилками; старіші — лише рядком, посилки на розгортання (?ref=) */
const RECENT_DAYS = 14;
/** Посилку часто створюють за день-два до реєстру — шукаємо документи з запасом */
const DOC_LOOKBACK_DAYS = 7;

async function ordersByTtn(ttns: string[]): Promise<Map<string, OrderByTtn>> {
  const map = new Map<string, OrderByTtn>();
  if (!ttns.length) return map;
  const { data } = await serviceClient
    .from('orders')
    .select('id, order_number, contact, total_price, carrier_accepted_at, tracking_number')
    .in('tracking_number', ttns)
    .limit(1000);
  for (const o of data ?? []) if (o.tracking_number) map.set(o.tracking_number, o as OrderByTtn);
  return map;
}

// GET — реєстри списком (з посилками за останні RECENT_DAYS) або один реєстр (?ref=)
async function _GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const apiKey = await getNpApiKey();
  const ref = new URL(req.url).searchParams.get('ref');

  if (ref) {
    const sheetRes = await npCall(apiKey, 'ScanSheet', 'getScanSheet', { Ref: ref });
    const sheet = sheetRes.data?.[0] as NpScanSheet | undefined;
    if (!sheet) return NextResponse.json({ error: 'Реєстр не знайдено в НП' }, { status: 404 });
    const at = sheetDate(sheet.DateTime);
    const docs: NpDoc[] = await npDocListWithRetry(apiKey, fmtDate(new Date(at.getTime() - DOC_LOOKBACK_DAYS * DAY)), fmtDate(new Date(at.getTime() + DAY)));
    const mine = docs.filter(d => d.ScanSheetNumber === sheet.Number);
    const [view] = buildRegisterViews([{ ...sheet, Ref: ref }], mine, await ordersByTtn(mine.map(d => String(d.IntDocNumber ?? '')).filter(Boolean)));
    return NextResponse.json({ register: view });
  }

  const listRes = await npCall(apiKey, 'ScanSheet', 'getScanSheetList', {});
  const sheets: NpScanSheet[] = listRes.data ?? [];
  const now = Date.now();
  const recent = sheets.filter(s => now - sheetDate(s.DateTime).getTime() <= RECENT_DAYS * DAY);
  const older = sheets.filter(s => !recent.includes(s));

  let registers = buildRegisterViews(recent, [], new Map());
  if (recent.length) {
    const oldest = Math.min(...recent.map(s => sheetDate(s.DateTime).getTime()));
    const docs: NpDoc[] = await npDocListWithRetry(apiKey, fmtDate(new Date(oldest - DOC_LOOKBACK_DAYS * DAY)), fmtDate(new Date(now + DAY)));
    const numbers = new Set(recent.map(s => s.Number));
    const mine = docs.filter(d => d.ScanSheetNumber && numbers.has(d.ScanSheetNumber));
    registers = buildRegisterViews(recent, mine, await ordersByTtn(mine.map(d => String(d.IntDocNumber ?? '')).filter(Boolean)));
  }

  return NextResponse.json({
    registers,
    older: older
      .sort((a, b) => String(b.DateTime).localeCompare(String(a.DateTime)))
      .map(s => ({ ref: s.Ref, number: s.Number, dateTime: s.DateTime, npCount: Number(s.Count) || 0 })),
  });
}

export const GET = withApi('admin/registers', _GET);

// DELETE — remove TTN from register OR delete entire scan sheet
async function _DELETE(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const { ttnNumber, registerRef, ttnNumbers } = await req.json() as { ttnNumber?: string; registerRef: string; ttnNumbers?: string[] };
  if (!registerRef) return NextResponse.json({ error: 'registerRef required' }, { status: 400 });

  const apiKey = await getNpApiKey();

  // Dissolve entire ScanSheet — resolve Refs for known TTNs then removeDocuments
  if (!ttnNumber) {
    const knownTtns: string[] = ttnNumbers ?? [];
    const docRefs: string[] = [];

    // Resolve each TTN number → NP document Ref
    for (const num of knownTtns) {
      const ref = await resolveTtnRef(apiKey, num);
      if (ref) docRefs.push(ref);
    }

    // If no TTNs provided or resolved — try scanning last 30 days by sheet number
    if (docRefs.length === 0) {
      const listRes = await npCall(apiKey, 'ScanSheet', 'getScanSheetList', {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sheetMeta = (listRes.data ?? []).find((s: any) => s.Ref === registerRef);
      if (sheetMeta?.Number) {
        const today = new Date();
        const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        const fmt = (d: Date) => `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
        const docsRes = await npCall(apiKey, 'InternetDocument', 'getDocumentList', {
          DateTimeFrom: fmt(monthAgo), DateTimeTo: fmt(today), GetFullList: '1', Page: '1',
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (docsRes.data ?? []).filter((d: any) => d.ScanSheetNumber === sheetMeta.Number)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .forEach((d: any) => { if (d.Ref) docRefs.push(d.Ref); });
      }
    }

    if (docRefs.length > 0) {
      const removeRes = await npCall(apiKey, 'ScanSheet', 'removeDocuments', {
        Ref: registerRef, DocumentRefs: docRefs,
      });
      if (!removeRes.success) {
        return NextResponse.json({
          error: npErrorText(removeRes, 'Помилка видалення ТТН з реєстру'),
        }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true, deleted: 'sheet', removed: docRefs.length });
  }

  // Remove single TTN from register
  const docRef = await resolveTtnRef(apiKey, ttnNumber);
  if (!docRef) return NextResponse.json({ error: `ТТН ${ttnNumber} не знайдено в НП` }, { status: 404 });

  const res = await npCall(apiKey, 'ScanSheet', 'removeDocuments', {
    Ref: registerRef,
    DocumentRefs: [docRef],
  });

  if (!res.success) {
    return NextResponse.json({ error: npErrorText(res, 'Помилка НП') }, { status: 400 });
  }

  return NextResponse.json({ ok: true, deleted: 'ttn' });
}

export const DELETE = withApi('admin/registers', _DELETE);

// POST — add TTN to register (creates new if no ref provided)
async function _POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const { ttnNumber, registerRef } = await req.json();
  if (!ttnNumber) return NextResponse.json({ error: 'TTN number required' }, { status: 400 });

  const apiKey = await getNpApiKey();

  // Resolve TTN number to document UUID
  const docRef = await resolveTtnRef(apiKey, ttnNumber);
  if (!docRef) return NextResponse.json({ error: `ТТН ${ttnNumber} не знайдено в НП` }, { status: 404 });

  // Add to register (new or existing)
  const payload: Record<string, unknown> = { DocumentRefs: [docRef] };
  if (registerRef) payload.Ref = registerRef;

  const res = await npCall(apiKey, 'ScanSheet', 'insertDocuments', payload);

  if (!res.success) {
    return NextResponse.json({ error: npErrorText(res, 'Помилка НП') }, { status: 400 });
  }

  // УВАГА: НП повертає success:true на рівні виклику, але РЕАЛЬНИЙ поштучний результат —
  // у sheet.Data.{Success|Warnings|Errors}, а НЕ у sheet.Success (там завжди []).
  //  - Data.Success  — документ реально доданий у новий/вказаний реєстр (sheet.Ref/Number заповнені);
  //  - Data.Warnings — документ ВЖЕ в іншому реєстрі (ScanSheetNumber), sheet.Ref/Number порожні;
  //  - Data.Errors   — справжня відмова.
  const sheet = res.data?.[0];
  const inner = sheet?.Data ?? {};
  const innerErrors   = Array.isArray(inner.Errors)   ? inner.Errors   : [];
  const innerWarnings = Array.isArray(inner.Warnings) ? inner.Warnings : [];
  const innerSuccess  = Array.isArray(inner.Success)  ? inner.Success  : [];

  if (innerErrors.length > 0) {
    const msg = innerErrors
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((e: any) => (typeof e === 'string' ? e : (e?.Error ?? e?.Warning ?? JSON.stringify(e))))
      .join('; ');
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Вже в іншому реєстрі — це не помилка додавання, а стан «документ зайнятий».
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const already = innerWarnings.find((w: any) => w?.Ref === docRef || /вже|уже/i.test(String(w?.Warning ?? '')));
  if (already && innerSuccess.length === 0) {
    return NextResponse.json({
      already: true,
      sheetNumber: already.ScanSheetNumber ?? null,
      error: `ТТН ${ttnNumber}: вже в реєстрі ${already.ScanSheetNumber ?? ''}`.trim(),
    }, { status: 409 });
  }

  return NextResponse.json({ ref: sheet?.Ref || null, number: sheet?.Number || null });
}

export const POST = withApi('admin/registers', _POST);
