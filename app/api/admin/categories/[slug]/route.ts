import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient, type TableUpdate } from '../../../../../lib/supabase-service';

const db = createServiceClient();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const { slug } = await params;
  const body = await req.json();

  const update: Record<string, unknown> = {};
  if ('description' in body) update.description = body.description ?? null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { error } = await db.from('categories').update(update as TableUpdate<'categories'>).eq('slug', slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
