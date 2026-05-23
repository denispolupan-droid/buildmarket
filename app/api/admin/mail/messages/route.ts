import { NextRequest, NextResponse } from 'next/server';
import { zohoFetch, getAccountId } from '../../../../../lib/zoho-mail';
import { checkAdmin } from '../../../../../lib/check-admin';

export async function GET(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const { searchParams } = req.nextUrl;
    const folderId = searchParams.get('folderId') ?? 'INBOX';
    const start    = searchParams.get('start') ?? '0';
    const limit    = searchParams.get('limit') ?? '20';

    const accountId = await getAccountId();
    const data = await zohoFetch(
      `/accounts/${accountId}/messages/view?folderId=${folderId}&start=${start}&limit=${limit}`,
    );
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === 'ZOHO_NOT_CONNECTED' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
