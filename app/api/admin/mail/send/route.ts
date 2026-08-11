import { NextRequest, NextResponse } from 'next/server';
import { zohoFetch, getAccountId, getSendAddresses } from '../../../../../lib/zoho-mail';
import { checkAdmin } from '../../../../../lib/check-admin';

export async function POST(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const { to, subject, content, replyTo, from } = await req.json() as {
      to: string; subject: string; content: string; replyTo?: string; from?: string;
    };

    if (!to || !subject || !content) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // FROM звіряємо зі списком дозволених адрес Zoho — довільну адресу з фронта
    // не приймаємо (та й Zoho б її відхилив).
    const senders = await getSendAddresses();
    const chosen = from
      ? senders.find(s => s.email.toLowerCase() === from.trim().toLowerCase())
      : undefined;
    const fromAddress = chosen?.email
      ?? senders.find(s => s.isDefault)?.email
      ?? process.env.ADMIN_EMAIL!;

    const accountId = await getAccountId();
    const body: Record<string, unknown> = {
      fromAddress,
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
