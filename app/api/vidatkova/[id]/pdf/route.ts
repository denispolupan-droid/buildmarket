import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildVidatkovaPdf } from '../../../../../lib/vidatkova-pdf';
import { loadVidatkova, vidatkovaRenderParams } from '../../../../../lib/vidatkova-doc';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Публічне завантаження PDF видаткової накладної. Доступ за unguessable UUID —
// та сама модель, що й сторінка /vidatkova/[id], яку клієнт відкриває за
// посиланням; нових даних понад те, що вже на сторінці, роут не розкриває.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // ?inline=1 → show in the browser's PDF viewer (used by the "Друк" button to
  // print the exact same portrait A4 file); default = download (attachment).
  const inline = req.nextUrl.searchParams.get('inline') === '1';

  const data = await loadVidatkova(db, id);
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { doc } = data;

  const pdf = await buildVidatkovaPdf(vidatkovaRenderParams(data));

  const asciiName = `FIXLINE_vidatkova_${String(doc.doc_number).replace(/[^\x20-\x7E]/g, '')}.pdf`;
  const utf8Name  = encodeURIComponent(`Видаткова_${doc.doc_number}.pdf`);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
