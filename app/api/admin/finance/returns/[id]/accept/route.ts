import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../../lib/auth-guard';
import { acceptSupplierReturn } from '../../../../../../../lib/accounting/returns';

// ПП: «Прийнято постачальником» — лише дата, проводки зроблено при відправці.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { accepted_at?: string };
  try {
    await acceptSupplierReturn(id, body.accepted_at ?? null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: /Це не|не проведено/.test(message) ? 400 : 500 });
  }
}
