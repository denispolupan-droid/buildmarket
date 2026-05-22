import { NextRequest, NextResponse } from 'next/server';
import { zohoFetch, getAccountId } from '../../../../../../lib/zoho-mail';

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
  try {
    const { id } = await params;
    const folderId = req.nextUrl.searchParams.get('folderId');
    await req.json(); // consume body
    const accountId = await getAccountId();

    // Use raw fetch to see Zoho's exact response regardless of status code
    const token = await (await import('../../../../../../lib/zoho-mail')).getAccessToken();
    const res = await fetch(`https://mail.zoho.eu/api/accounts/${accountId}/updatemessage`, {
      method: 'PUT',
      headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: [id], isRead: 'true' }),
    });
    const text = await res.text();
    return NextResponse.json({ status: res.status, body: text });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
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
