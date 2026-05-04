import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function checkAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.user_metadata?.role === 'admin';
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  const { data: supplier } = await serviceClient
    .from('suppliers')
    .select('source_url, file_format')
    .eq('id', id)
    .single();

  if (!supplier?.source_url) return NextResponse.json({ error: 'URL не вказано' }, { status: 400 });
  if (supplier.file_format !== 'xls') return NextResponse.json({ error: 'Тільки для Excel-файлів' }, { status: 400 });

  const res = await fetch(supplier.source_url);
  if (!res.ok) return NextResponse.json({ error: `Не вдалось завантажити файл (HTTP ${res.status})` }, { status: 502 });

  const buffer = Buffer.from(await res.arrayBuffer());
  const wb = XLSX.read(buffer, { type: 'buffer' });

  const SKU_RE = /^\d{3,}-\d{2,}$/;

  const sheets = wb.SheetNames.map((name, i) => {
    const hidden = (wb.Workbook?.Sheets?.[i]?.Hidden ?? 0) > 0;
    const ws = wb.Sheets[name];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

    // Count rows that look like product data (have SKU-like values)
    const skuRows = raw.filter(row =>
      Object.values(row).some(v => SKU_RE.test(String(v).trim()))
    ).length;

    // Also count total non-empty rows
    const totalRows = raw.filter(row =>
      Object.values(row).some(v => String(v).trim() !== '')
    ).length;

    return { name, hidden, skuRows, totalRows };
  });

  return NextResponse.json({ sheets });
}
