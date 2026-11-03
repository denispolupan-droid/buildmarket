import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { assertPublicUrl } from '../../../../../../lib/safe-fetch-url';
import * as XLSX from 'xlsx';
import { createServiceClient } from '../../../../../../lib/supabase-service';
import { withApi } from '../../../../../../lib/api-handler';

const serviceClient = createServiceClient();

async function checkAdmin() {
  return (await requireStaff('admin')).ok;
}

async function _GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = Number((await params).id);

  const { data: supplier } = await serviceClient
    .from('suppliers')
    .select('source_url, file_format')
    .eq('id', id)
    .single();

  if (!supplier?.source_url) return NextResponse.json({ error: 'URL не вказано' }, { status: 400 });
  if (supplier.file_format !== 'xls') return NextResponse.json({ error: 'Тільки для Excel-файлів' }, { status: 400 });

  try {
    assertPublicUrl(supplier.source_url); // SSRF-захист
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Некоректний URL' }, { status: 400 });
  }

  const res = await fetch(supplier.source_url);
  if (!res.ok) return NextResponse.json({ error: `Не вдалось завантажити файл (HTTP ${res.status})` }, { status: 502 });

  const buffer = Buffer.from(await res.arrayBuffer());
  const wb = XLSX.read(buffer, { type: 'buffer' });

  const SKU_RE = /^\d{3,}-\d{2,}$/;

  const sheets = wb.SheetNames.map((name, i) => {
    const hidden = (wb.Workbook?.Sheets?.[i]?.Hidden ?? 0) > 0;
    const ws = wb.Sheets[name];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

    const skuRows = raw.filter(row =>
      Object.values(row).some(v => SKU_RE.test(String(v).trim()))
    ).length;

    const totalRows = raw.filter(row =>
      Object.values(row).some(v => String(v).trim() !== '')
    ).length;

    // Collect all column headers from the sheet
    const headers = raw.length > 0 ? Object.keys(raw[0]) : [];

    return { name, hidden, skuRows, totalRows, headers };
  });

  return NextResponse.json({ sheets });
}

export const GET = withApi('admin/suppliers/[id]/sheets', _GET);
