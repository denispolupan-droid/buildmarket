import { NextRequest, NextResponse } from 'next/server';
import { zohoFetch, getAccountId } from '../../../../../lib/zoho-mail';

export async function GET(req: NextRequest) {
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
