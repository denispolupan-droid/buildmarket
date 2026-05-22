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

    // Try 1: folder path with boolean
    if (folderId) {
      try {
        const r1 = await zohoFetch(
          `/accounts/${accountId}/folders/${folderId}/messages/${id}`,
          { method: 'PUT', body: JSON.stringify({ isRead: true }) },
        );
        if (!r1?.data?.errorCode) return NextResponse.json({ ok: true });
      } catch { /* try next */ }
    }

    // Try 2: updatemessage with string "true"
    try {
      const r2 = await zohoFetch(`/accounts/${accountId}/updatemessage`, {
        method: 'PUT',
        body: JSON.stringify({ messageId: id, isRead: 'true' }),
      });
      if (!r2?.data?.errorCode) return NextResponse.json({ ok: true });
    } catch { /* try next */ }

    // Try 3: updatemessage with mode
    const r3 = await zohoFetch(`/accounts/${accountId}/updatemessage`, {
      method: 'PUT',
      body: JSON.stringify({ messageId: id, mode: 'markAsRead' }),
    });
    return NextResponse.json(r3);
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
