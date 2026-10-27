import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../../lib/supabase';
import { loadReturnPrint, type ReturnPrintForm } from '../../../../../../../lib/return-doc';
import { buildReturnPdf } from '../../../../../../../lib/return-pdf';

// PDF форми повернення: ?form=nakladna (ПВ і ПП) | akt (лише ПВ).
// ?inline=1 — відкрити у вкладці (для друку), інакше завантаження.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const formParam = req.nextUrl.searchParams.get('form');
  const form: ReturnPrintForm = formParam === 'akt' ? 'akt' : 'nakladna';
  const inline = req.nextUrl.searchParams.get('inline') === '1';

  const data = await loadReturnPrint(createServiceClient(), id, form);
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const pdf = await buildReturnPdf(data);
  const safeNumber = data.docNumber.replace(/[^\x20-\x7E]/g, '');
  const asciiName = `FIXLINE_${form === 'akt' ? 'akt_povernennya' : 'nakladna_povernennya'}_${safeNumber}.pdf`;
  const utf8Name  = encodeURIComponent(`${form === 'akt' ? 'Акт повернення' : 'Накладна на повернення'}_${data.docNumber}.pdf`);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
