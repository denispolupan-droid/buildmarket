import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createDocument, confirmDocument, cancelDocument, correctDocument } from '../../../../../lib/accounting/documents';
import type { CreateDocumentInput } from '../../../../../lib/accounting/types';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { action, document_id, reason, ...input } = body;

  try {
    if (action === 'confirm') {
      await confirmDocument(document_id, user.email ?? 'admin');
      return NextResponse.json({ ok: true });
    }
    if (action === 'cancel') {
      await cancelDocument(document_id, user.email ?? 'admin', reason);
      return NextResponse.json({ ok: true });
    }
    if (action === 'correct') {
      const result = await correctDocument(document_id, user.email ?? 'admin');
      return NextResponse.json({ ok: true, ...result });
    }

    const doc = await createDocument({ ...input as CreateDocumentInput, created_by: user.email ?? 'admin' });
    return NextResponse.json(doc);
  } catch (err: unknown) {
    const message = err instanceof Error
      ? err.message
      : (err && typeof err === 'object' && 'message' in err)
        ? String((err as { message: unknown }).message)
        : JSON.stringify(err);
    console.error('[accounting/documents]', err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
