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

    // Zoho EU: messageId must be an array
    const data = await zohoFetch(`/accounts/${accountId}/updatemessage`, {
      method: 'PUT',
      body: JSON.stringify({ messageId: [id], isRead: 'true' }),
    });
    console.log('ZOHO mark-as-read response:', JSON.stringify(data));
    return NextResponse.json({ zohoResponse: data });
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
