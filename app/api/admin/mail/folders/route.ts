import { NextResponse } from 'next/server';
import { zohoFetch, getAccountId } from '../../../../../lib/zoho-mail';
import { requireStaff } from '../../../../../lib/auth-guard';

export async function GET() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  try {
    const accountId = await getAccountId();
    const data = await zohoFetch(`/accounts/${accountId}/folders`);
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === 'ZOHO_NOT_CONNECTED' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
