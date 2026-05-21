import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';

const BUCKET = 'procurement-docs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = createServiceClient();

  // Перевіряємо що документ існує
  const { data: doc } = await db
    .from('acc_documents').select('id, meta').eq('id', id).single();
  if (!doc) return NextResponse.json({ error: 'Не знайдено' }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Файл не вказано' }, { status: 400 });

  const ext      = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
  const path     = `invoices/${id}/${Date.now()}.${ext}`;
  const buffer   = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await db.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  // Підписане посилання на 7 днів (приватний bucket)
  const { data: signed } = await db.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  // Зберігаємо шлях у meta документа
  const existingMeta = (doc.meta as Record<string, unknown>) ?? {};
  await db.from('acc_documents').update({
    meta: { ...existingMeta, invoice_file_path: path, invoice_file_name: file.name },
  }).eq('id', id);

  return NextResponse.json({
    path,
    name:       file.name,
    signed_url: signed?.signedUrl ?? null,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = createServiceClient();

  const { data: doc } = await db
    .from('acc_documents').select('meta').eq('id', id).single();
  if (!doc) return NextResponse.json({ error: 'Не знайдено' }, { status: 404 });

  const meta = (doc.meta as Record<string, unknown>) ?? {};
  const path = meta.invoice_file_path as string | undefined;

  if (path) {
    await db.storage.from(BUCKET).remove([path]);
    const { invoice_file_path: _, invoice_file_name: __, ...rest } = meta;
    await db.from('acc_documents').update({ meta: rest }).eq('id', id);
  }

  return NextResponse.json({ ok: true });
}

// GET — повертає підписане посилання для перегляду/завантаження
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = createServiceClient();

  const { data: doc } = await db
    .from('acc_documents').select('meta').eq('id', id).single();

  const meta = (doc?.meta as Record<string, unknown>) ?? {};
  const path = meta.invoice_file_path as string | undefined;
  if (!path) return NextResponse.json({ url: null, name: null });

  const { data: signed } = await db.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60); // 1 година

  return NextResponse.json({
    url:  signed?.signedUrl ?? null,
    name: meta.invoice_file_name ?? path.split('/').pop(),
  });
}
