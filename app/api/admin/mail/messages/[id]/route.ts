import { NextRequest, NextResponse } from 'next/server';
import { zohoFetch, getAccountId, getAccessToken } from '../../../../../../lib/zoho-mail';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const folderId = req.nextUrl.searchParams.get('folderId');
    const accountId = await getAccountId();

    // Zoho EU requires folderId in the path
    if (folderId) {
      const data = await zohoFetch(`/accounts/${accountId}/folders/${folderId}/messages/${id}/content`);
      if (data?.data && !data.data.errorCode) return NextResponse.json(data);
    }

    // Fallback: try without folderId (some Zoho setups support this)
    const data = await zohoFetch(`/accounts/${accountId}/messages/${id}`);
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let step = 'init';
  try {
    step = 'params';
    const { id } = await params;
    step = 'body';
    try { await req.json(); } catch { /* ignore empty body */ }
    step = 'accountId';
    const accountId = await getAccountId();
    step = 'token';
    const token = await getAccessToken();
    step = 'fetch';
    // Try form-encoded (Zoho sometimes requires this instead of JSON)
    const res = await fetch(`https://mail.zoho.eu/api/accounts/${accountId}/updatemessage`, {
      method: 'PUT',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ messageId: id, isRead: 'true' }).toString(),
    });
    step = 'text';
    const text = await res.text();
    return NextResponse.json({ status: res.status, body: text });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e), step }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const accountId = await getAccountId();
    const data = await zohoFetch(`/accounts/${accountId}/messages/${id}`, { method: 'DELETE' });
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
