import { NextRequest, NextResponse } from 'next/server';
import { getAccountId, getAccessToken } from '../../../../../lib/zoho-mail';
import { checkAdmin } from '../../../../../lib/check-admin';

export async function GET(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const messageId = req.nextUrl.searchParams.get('messageId');
  if (!messageId) return NextResponse.json({ error: 'pass ?messageId=...' });

  try {
    const accountId = await getAccountId();
    const token = await getAccessToken();

    const results: Record<string, unknown> = {};

    // Test 1: form-encoded
    const r1 = await fetch(`https://mail.zoho.eu/api/accounts/${accountId}/updatemessage`, {
      method: 'PUT',
      headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ messageId, isRead: 'true' }).toString(),
    });
    results.formEncoded = { status: r1.status, body: await r1.text() };

    return NextResponse.json({ accountId, results });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) });
  }
}
