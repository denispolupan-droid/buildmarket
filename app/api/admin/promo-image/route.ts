import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'webp';
  const path = `promo/banner.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error } = await serviceClient.storage
    .from('products')
    .upload(path, Buffer.from(bytes), { contentType: file.type, upsert: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = serviceClient.storage.from('products').getPublicUrl(path);
  // append cache-bust so new image shows immediately
  return NextResponse.json({ url: `${publicUrl}?t=${Date.now()}` });
}

export async function DELETE() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await serviceClient.storage.from('products').remove(['promo/banner.webp', 'promo/banner.jpg', 'promo/banner.png']);
  return NextResponse.json({ ok: true });
}
