import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { pathToFileURL } from 'url';
import { createSupabaseServer } from '../../../../../lib/supabase-server';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function checkAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.app_metadata?.role === 'admin' ? user : null;
}

type RefEntry = { rz_id: string; name: string; commission_pct: number };

function parsePdf(text: string): { commissions: Map<string, number>; refs: RefEntry[] } {
  const commissions = new Map<string, number>();
  const refs: RefEntry[] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    // Format A: ID in parentheses — "(4629382) ... 10  6  4  0,8  10,8"
    const matchA = line.match(/\((\d{5,})\)/);
    if (matchA) {
      const after = line.slice(line.indexOf(matchA[0]) + matchA[0].length);
      const nums = [...after.matchAll(/(\d+(?:[.,]\d+)?)/g)]
        .map(m => parseFloat((m[1] as string).replace(',', '.')))
        .filter(n => n > 0 && n <= 50);
      if (nums.length > 0 && !commissions.has(matchA[1]))
        commissions.set(matchA[1], nums[nums.length - 1]);
      continue;
    }

    // Format B: find ALL 5-7 digit IDs anywhere in the line
    // (each PDF page is one long string — not just the first category per page)
    for (const m of line.matchAll(/\b(\d{5,7})\b/g)) {
      const id     = m[1];
      const afterId = line.slice(m.index! + m[0].length);

      // Skip price ranges: "7000 - 13999" — number followed by dash
      if (/^\s*[-–]/.test(afterId)) continue;

      // Skip if no Ukrainian text in next 80 chars (price tiers: "13999  5  3  2  0,4  5,4")
      const excerpt = afterId.slice(0, 250);
      if (!/[А-ЯҐЄІЇа-яґєіі]/.test(excerpt.slice(0, 80))) continue;

      // Find the FIRST 5-number sequence (main rate row), not the last number
      // Format: "15   9   6   1,2   16,2" — 5th number is commission+VAT
      const seqMatch = excerpt.match(
        /(\d{1,3}(?:[.,]\d+)?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+(?:[.,]\d+)?)\s+([\d,]+(?:[.,]\d+)?)/
      );
      if (!seqMatch) continue;
      const pct = parseFloat(seqMatch[5].replace(',', '.'));
      if (pct <= 0 || pct > 50) continue;

      if (!commissions.has(id)) {
        commissions.set(id, pct);

        // Extract name: skip optional numbering prefix, capture Ukrainian name
        const nameMatch = afterId.match(
          /^\s+(?:\d+(?:[.\d]*)\s+)?([А-ЯҐЄІЇа-яґєіїA-Za-z()''"«»,.ʼ\- ]+?)(?:\s{2,}|\s+\d{1,2}\s)/
        );
        if (nameMatch) {
          const name = nameMatch[1].trim();
          if (name.length > 2) refs.push({ rz_id: id, name, commission_pct: pct });
        }
      }
    }
  }

  return { commissions, refs };
}

// GET: fetch all refs for the dropdown
export async function GET() {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await db
    .from('rozetka_commission_refs')
    .select('rz_id, name, commission_pct')
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// PATCH: apply pre-parsed changes (second step — no re-upload needed)
export async function PATCH(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { changes } = await req.json() as { changes: Array<{ slug: string; new_pct: number; new_label?: string | null; new_category_name?: string | null }> };
  if (!Array.isArray(changes) || changes.length === 0) {
    return NextResponse.json({ error: 'Немає змін' }, { status: 400 });
  }
  for (const c of changes) {
    const update: Record<string, unknown> = { rozetka_commission_pct: c.new_pct };
    if (c.new_label) update.rozetka_commission_label = c.new_label;
    if (c.new_category_name) update.rozetka_category_name = c.new_category_name;
    await db.from('categories').update(update).eq('slug', c.slug);
  }
  return NextResponse.json({ applied: true, count: changes.length });
}

export async function POST(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const form = await req.formData();
  const file = form.get('pdf') as File | null;

  if (!file) return NextResponse.json({ error: 'Файл не передано' }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());

  let pdfText: string;
  try {
    // Polyfill DOMMatrix for pdfjs in Node.js (no browser env)
    if (typeof globalThis.DOMMatrix === 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).DOMMatrix = class DOMMatrix {
        a=1;b=0;c=0;d=1;e=0;f=0;
        m11=1;m12=0;m13=0;m14=0;m21=0;m22=1;m23=0;m24=0;
        m31=0;m32=0;m33=1;m34=0;m41=0;m42=0;m43=0;m44=1;
        is2D=true;isIdentity=true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(_?: any) {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        static fromMatrix() { return new (globalThis as any).DOMMatrix(); }
        translate() { return this; } scale() { return this; }
        rotate() { return this; } multiply() { return this; }
        inverse() { return this; }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        transformPoint(p?: any) { return p ?? { x:0,y:0,z:0,w:0 }; }
      };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs') as any;
    pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
      path.join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')
    ).href;
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    let text = '';
    for (let i = 1; i <= (doc.numPages as number); i++) {
      const page    = await doc.getPage(i);
      const content = await page.getTextContent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      text += (content.items as any[]).map((it: any) => it.str).join(' ') + '\n';
    }
    pdfText = text;
  } catch (e) {
    return NextResponse.json({ error: `Помилка читання PDF: ${(e as Error).message}` }, { status: 422 });
  }

  const { commissions: pdfMap, refs } = parsePdf(pdfText);
  if (pdfMap.size === 0) {
    return NextResponse.json({ error: 'Не вдалося знайти комісії в PDF. Перевірте формат файлу.' }, { status: 422 });
  }

  // Upsert refs into reference table
  if (refs.length > 0) {
    await db.from('rozetka_commission_refs').upsert(
      refs.map(r => ({ rz_id: r.rz_id, name: r.name, commission_pct: r.commission_pct, updated_at: new Date().toISOString() })),
      { onConflict: 'rz_id' }
    );
  }

  const { data: categories } = await db
    .from('categories')
    .select('slug, name, rozetka_category_id, rozetka_category_name, rozetka_commission_pct, rozetka_commission_rz_id, rozetka_commission_label')
    .not('rozetka_category_id', 'is', null);

  type Change    = { slug: string; name: string; rz_id: string; source_label: string; old_pct: number | null; new_pct: number; new_label: string | null; new_category_name: string | null };
  type Unmatched = { slug: string; name: string; rz_id: string; current_pct: number | null };

  const refsMap = new Map(refs.map(r => [r.rz_id, r.name]));
  const changes: Change[] = [];
  let unchangedCount = 0;
  const unmatched: Unmatched[] = [];

  for (const cat of categories ?? []) {
    const sourceId = (cat.rozetka_commission_rz_id || cat.rozetka_category_id)!;
    const newPct   = pdfMap.get(sourceId);

    if (newPct == null) {
      unmatched.push({ slug: cat.slug, name: cat.name, rz_id: cat.rozetka_category_id!, current_pct: cat.rozetka_commission_pct != null ? Number(cat.rozetka_commission_pct) : null });
      continue;
    }
    const oldPct    = cat.rozetka_commission_pct != null ? Number(cat.rozetka_commission_pct) : null;
    const newLabel  = refsMap.get(sourceId) ?? null;
    const oldLabel  = cat.rozetka_commission_label ?? null;
    // Name for the product feed category (rozetka_category_id), may differ from commission source
    const catNameFromPdf = cat.rozetka_category_id ? (refsMap.get(cat.rozetka_category_id) ?? null) : null;
    const pctSame   = oldPct === newPct;
    const labelSame = newLabel === null || newLabel === oldLabel;
    const nameSame  = catNameFromPdf === null || catNameFromPdf === (cat.rozetka_category_name ?? null);

    if (pctSame && labelSame && nameSame) { unchangedCount++; continue; }

    const sourceLabel = newLabel || oldLabel || sourceId;
    changes.push({ slug: cat.slug, name: cat.name, rz_id: cat.rozetka_category_id!, source_label: sourceLabel, old_pct: oldPct, new_pct: newPct, new_label: newLabel, new_category_name: catNameFromPdf });
  }

  return NextResponse.json({ pdfCategories: pdfMap.size, refsUpdated: refs.length, changes, unchangedCount, unmatched });
}
