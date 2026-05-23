import { NextRequest, NextResponse } from 'next/server';
import { zohoFetch, getAccountId } from '../../../../../lib/zoho-mail';
import { checkAdmin } from '../../../../../lib/check-admin';

export async function POST(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const { to, subject, content, replyTo } = await req.json() as {
      to: string; subject: string; content: string; replyTo?: string;
    };

    if (!to || !subject || !content) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const accountId = await getAccountId();
    const body: Record<string, unknown> = {
      fromAddress: process.env.ADMIN_EMAIL!,
      toAddress:   to,
      subject,
      content,
      mailFormat:  'html',
    };
    if (replyTo) body.replyTo = replyTo;

    const data = await zohoFetch(`/accounts/${accountId}/messages`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
