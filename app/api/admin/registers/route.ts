import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';

const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getNpApiKey() {
  const { data } = await serviceClient.from('app_settings').select('key, value').in('key', ['np_api_key']);
  const cfg: Record<string, string> = {};
  (data ?? []).forEach(r => { cfg[r.key] = r.value; });
  return cfg.np_api_key || process.env.NOVA_POSHTA_API_KEY || '';
}

async function npCall(apiKey: string, modelName: string, calledMethod: string, methodProperties: object) {
  const res = await fetch(NP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, modelName, calledMethod, methodProperties }),
  });
  return res.json();
}

// Resolve TTN number → Document UUID
async function resolveTtnRef(apiKey: string, ttnNumber: string): Promise<string | null> {
  // Method 1: TrackingDocument
  const trackRes = await npCall(apiKey, 'TrackingDocument', 'getStatusDocuments', {
    Documents: [{ DocumentNumber: ttnNumber }],
  });
  const trackRef = trackRes.data?.[0]?.Ref;
  if (trackRef) return trackRef;

  // Method 2: InternetDocument.getDocumentList (searches by TTN number)
  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2,'0')}.${String(today.getMonth()+1).padStart(2,'0')}.${today.getFullYear()}`;
  const docRes = await npCall(apiKey, 'InternetDocument', 'getDocumentList', {
    DateTimeFrom: dateStr,
    DateTimeTo:   dateStr,
    GetFullList:  '0',
    Page:         '1',
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const found = (docRes.data ?? []).find((d: any) => d.IntDocNumber === ttnNumber);
  if (found?.Ref) return found.Ref;

  // Method 3: search last 7 days
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fromStr = `${String(weekAgo.getDate()).padStart(2,'0')}.${String(weekAgo.getMonth()+1).padStart(2,'0')}.${weekAgo.getFullYear()}`;
  const wideRes = await npCall(apiKey, 'InternetDocument', 'getDocumentList', {
    DateTimeFrom: fromStr,
    DateTimeTo:   dateStr,
    GetFullList:  '0',
    Page:         '1',
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const foundWide = (wideRes.data ?? []).find((d: any) => d.IntDocNumber === ttnNumber);
  return foundWide?.Ref ?? null;
}

// GET — list of scan sheets, or details of a specific one
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const apiKey = await getNpApiKey();
  const ref = new URL(req.url).searchParams.get('ref');

  // Return details + TTNs for a specific sheet
  if (ref) {
    // Step 1: get sheet summary (Number + DateTime)
    const sheetRes = await npCall(apiKey, 'ScanSheet', 'getScanSheet', { Ref: ref });
    const sheet = sheetRes.data?.[0];
    const sheetNumber: string = sheet?.Number ?? '';
    const sheetDateTime: string = sheet?.DateTime ?? '';

    // Step 2: determine the date of the sheet
    const datePart = sheetDateTime.split(' ')[0]; // "2026-05-13"
    const [yr, mo, dy] = (datePart || new Date().toISOString().slice(0,10)).split('-');
    const dateForApi = `${dy}.${mo}.${yr}`;

    // Step 3: get documents for that date and filter by ScanSheetNumber
    const docsRes = await npCall(apiKey, 'InternetDocument', 'getDocumentList', {
      DateTimeFrom: dateForApi,
      DateTimeTo:   dateForApi,
      GetFullList:  '1',
      Page:         '1',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allDocs: any[] = docsRes.data ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered = allDocs.filter((d: any) => d.ScanSheetNumber === sheetNumber);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ttns = filtered.map((d: any) => ({
      ttn:     d.IntDocNumber ?? '',
      contact: d.RecipientContactPerson ?? d.RecipientDescription ?? '',
      amount:  parseFloat(d.BackwardDeliverySum ?? d.CostOnSite ?? '0') || 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })).filter((t: any) => t.ttn);

    return NextResponse.json({ number: sheetNumber, ttns });
  }

  const res = await npCall(apiKey, 'ScanSheet', 'getScanSheetList', {});
  return NextResponse.json({ sheets: res.data ?? [] });
}

// DELETE — remove TTN from register OR delete entire scan sheet
export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
          error: removeRes.errors?.join('; ') ?? 'Помилка видалення ТТН з реєстру',
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
    return NextResponse.json({ error: res.errors?.join('; ') ?? 'Помилка НП' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, deleted: 'ttn' });
}

// POST — add TTN to register (creates new if no ref provided)
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
    return NextResponse.json({ error: res.errors?.join('; ') ?? 'Помилка НП' }, { status: 400 });
  }

  const sheet = res.data?.[0];
  return NextResponse.json({ ref: sheet?.Ref, number: sheet?.Number });
}
