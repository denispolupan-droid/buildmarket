import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../../lib/auth-guard';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface BracketRow {
  rz_id: string;
  category_name: string | null;
  brand: string;
  price_from: number;
  price_to: number;
  base_pct: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cellVal(v: any): any {
  if (v && typeof v === 'object') {
    if ('result' in v) return v.result;
    if ('text' in v) return v.text;
    if ('richText' in v) return v.richText.map((t: { text: string }) => t.text).join('');
  }
  return v;
}

// Парсинг тарифного Excel Rozetka: аркуш «Тариф», колонки
// ID категорії | Категорія | Бренд | Діапазон цін | Відсоток комісії
async function parseTariff(data: ArrayBuffer): Promise<BracketRow[]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  // Лист «Тариф» шукаємо за назвою (стійко до зміни порядку листів у вигрузці), fallback — перший.
  const ws = wb.getWorksheet('Тариф') ?? wb.worksheets[0];
  if (!ws) throw new Error('Порожній файл');

  // Санітарна перевірка формату: 5-та колонка має бути «відсоток» (число у рядках даних).
  const header = String(cellVal(ws.getCell(1, 5).value) ?? '').toLowerCase();
  if (!header.includes('коміс') && !header.includes('відсот') && !header.includes('%')) {
    throw new Error('Несподіваний формат: очікується колонка «Відсоток комісії» 5-ю. Це точно тарифний файл Rozetka?');
  }

  // (rz_id|brand) -> { name, rows:[{from,to,pct}] }
  const groups = new Map<string, { rz: string; name: string | null; brand: string; rows: { from: number; to: number | null; pct: number }[] }>();
  let curId: string | null = null;
  let curName: string | null = null;

  for (let r = 2; r <= ws.rowCount; r++) {
    const id    = cellVal(ws.getCell(r, 1).value);
    const name  = cellVal(ws.getCell(r, 2).value);
    const brand0 = cellVal(ws.getCell(r, 3).value);
    const range = cellVal(ws.getCell(r, 4).value);
    const pct   = Number(cellVal(ws.getCell(r, 5).value));

    if (id != null && id !== '') { curId = String(id); curName = name != null ? String(name) : null; }
    if (curId == null || !isFinite(pct)) continue;

    const brand = (brand0 == null || brand0 === '') ? '-' : String(brand0);
    const key = `${curId}|${brand}`;
    if (!groups.has(key)) groups.set(key, { rz: curId, name: curName, brand, rows: [] });

    let from: number, to: number | null;
    if (range === '-' || range == null || range === '') { from = 0; to = null; }
    else {
      const m = String(range).match(/(\d+)\s*-\s*(\d+)/);
      if (!m) continue;
      from = parseInt(m[1], 10); to = parseInt(m[2], 10);
    }
    groups.get(key)!.rows.push({ from, to, pct });
  }

  // Резолвимо верхню межу базового ('-') тиру = (мінімальний явний from) − 1, інакше великий sentinel.
  const out: BracketRow[] = [];
  for (const g of groups.values()) {
    const explicitFroms = g.rows.filter(r => r.from > 0).map(r => r.from);
    const minExpl = explicitFroms.length ? Math.min(...explicitFroms) : null;
    for (const row of g.rows) {
      const price_to = row.to != null ? row.to : (minExpl != null && minExpl > 0 ? minExpl - 1 : 999999999);
      out.push({ rz_id: g.rz, category_name: g.name, brand: g.brand, price_from: row.from, price_to, base_pct: row.pct });
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const form = await req.formData();
  const file = form.get('xlsx') as File | null;
  const apply = String(form.get('apply') ?? 'false') === 'true';
  if (!file) return NextResponse.json({ error: 'Файл не передано' }, { status: 400 });

  let rows: BracketRow[];
  try {
    rows = await parseTariff(await file.arrayBuffer());
  } catch (e) {
    return NextResponse.json({ error: `Помилка читання Excel: ${(e as Error).message}` }, { status: 422 });
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Не знайдено тарифних рядків. Перевірте формат файлу.' }, { status: 422 });
  }

  // Поточні тарифні бракети (manual не чіпаємо).
  const { data: current } = await db
    .from('rozetka_commission_brackets')
    .select('rz_id, brand, price_from, base_pct')
    .eq('source', 'tariff');
  const curMap = new Map<string, number>();
  for (const c of current ?? []) curMap.set(`${c.rz_id}|${c.brand}|${c.price_from}`, Number(c.base_pct));

  const newMap = new Map<string, BracketRow>();
  for (const r of rows) newMap.set(`${r.rz_id}|${r.brand}|${r.price_from}`, r);

  const changes: { rz_id: string; category_name: string | null; price_from: number; old_pct: number | null; new_pct: number }[] = [];
  let unchanged = 0, added = 0;
  for (const [k, r] of newMap) {
    const old = curMap.get(k);
    if (old == null) { added++; changes.push({ rz_id: r.rz_id, category_name: r.category_name, price_from: r.price_from, old_pct: null, new_pct: r.base_pct }); }
    else if (Math.abs(old - r.base_pct) > 0.001) changes.push({ rz_id: r.rz_id, category_name: r.category_name, price_from: r.price_from, old_pct: old, new_pct: r.base_pct });
    else unchanged++;
  }
  let removed = 0;
  for (const k of curMap.keys()) if (!newMap.has(k)) removed++;

  const summary = {
    categories: new Set(rows.map(r => r.rz_id)).size,
    brackets:   rows.length,
    added,
    changed:    changes.length - added,
    removed,
    unchanged,
    // до 40 прикладів змін для превью
    sampleChanges: changes.slice(0, 40),
  };

  if (!apply) {
    return NextResponse.json({ applied: false, ...summary });
  }

  // Застосування: прибираємо старі tariff-рядки, вставляємо нові (source='tariff').
  // upsert по (rz_id,brand,price_from): якщо новий тариф покриває колишню manual-достройку —
  // вона стає tariff-рядком (реальні дані Rozetka перекривають ручний патч).
  const { error: delErr } = await db.from('rozetka_commission_brackets').delete().eq('source', 'tariff');
  if (delErr) return NextResponse.json({ error: `Помилка очистки: ${delErr.message}` }, { status: 500 });

  const payload = rows.map(r => ({ ...r, source: 'tariff', updated_at: new Date().toISOString() }));
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await db
      .from('rozetka_commission_brackets')
      .upsert(payload.slice(i, i + 500), { onConflict: 'rz_id,brand,price_from' });
    if (error) return NextResponse.json({ error: `Помилка вставки: ${error.message}` }, { status: 500 });
  }

  const { count } = await db.from('rozetka_commission_brackets').select('id', { count: 'exact', head: true });
  return NextResponse.json({ applied: true, categories: summary.categories, brackets: summary.brackets, totalInTable: count ?? null });
}
