import { NextResponse } from 'next/server';
import { zohoFetch, getAccountId } from '../../../../../lib/zoho-mail';
import { checkAdmin } from '../../../../../lib/check-admin';

export async function GET() {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
