import { NextRequest, NextResponse } from 'next/server';
import { zohoFetch, getAccountId } from '../../../../../../lib/zoho-mail';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const accountId = await getAccountId();

  // Повертаємо raw відповідь Zoho без обробки — для діагностики
  const token = await (await import('../../../../../../lib/zoho-mail')).getAccessToken();
  const res1 = await fetch(`https://mail.zoho.eu/api/accounts/${accountId}/messages/${id}/content`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  const raw1 = await res1.json();

  const res2 = await fetch(`https://mail.zoho.eu/api/accounts/${accountId}/messages/${id}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  const raw2 = await res2.json();

  return NextResponse.json({ _content_endpoint: raw1, _message_endpoint: raw2 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const accountId = await getAccountId();
    const data = await zohoFetch(`/accounts/${accountId}/updatemessage`, {
      method: 'PUT',
      body: JSON.stringify({ ...body, messageId: id }),
    });
    return NextResponse.json(data);
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
