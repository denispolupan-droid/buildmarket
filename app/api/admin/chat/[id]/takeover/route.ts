import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase-service';
import { withApi } from '../../../../../../lib/api-handler';

const db = createServiceClient();

async function _POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const { ai_enabled } = await req.json() as { ai_enabled: boolean };

  const { error } = await db
    .from('chat_sessions')
    .update({ ai_enabled })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ai_enabled });
}

export const POST = withApi('admin/chat/[id]/takeover', _POST);
