import { NextRequest, NextResponse } from 'next/server';
import { zohoFetch, getAccountId } from '../../../../../../lib/zoho-mail';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const accountId = await getAccountId();

    // Try /content endpoint first, then fall back to base message endpoint
    const contentData = await zohoFetch(`/accounts/${accountId}/messages/${id}/content`);
    const msgData = contentData?.data ?? contentData ?? {};

    // If content is empty, fetch base message which may have more fields
    const hasContent = !!(msgData.content || msgData.htmlBody || msgData.textBody || msgData.body);
    if (!hasContent) {
      const baseData = await zohoFetch(`/accounts/${accountId}/messages/${id}`);
      const base = baseData?.data ?? baseData ?? {};
      // Merge: prefer base fields for content, keep content fields for metadata
      return NextResponse.json({ data: { ...msgData, ...base, _debug_keys: Object.keys(base) } });
    }

    return NextResponse.json(contentData);
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
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
