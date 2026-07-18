import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { uploadToR2, deleteFromR2 } from '../../../../lib/r2';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'webp';
  const path = `promo/banner.${ext}`;
  const bytes = await file.arrayBuffer();

  let url: string;
  try {
    // Fixed filename (no content hash) — short cache so a re-upload shows up promptly;
    // the "?t=" query string still isn't honored by the edge cache, but a 5-minute
    // max-age bounds staleness on its own.
    url = await uploadToR2(path, Buffer.from(bytes), file.type, 'public, max-age=300');
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload failed' }, { status: 500 });
  }

  return NextResponse.json({ url: `${url}?t=${Date.now()}` });
}

export async function DELETE() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await deleteFromR2(['promo/banner.webp', 'promo/banner.jpg', 'promo/banner.png']);
  return NextResponse.json({ ok: true });
}
