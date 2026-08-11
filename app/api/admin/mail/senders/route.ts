import { NextResponse } from 'next/server';
import { getSendAddresses } from '../../../../../lib/zoho-mail';
import { createServiceClient } from '../../../../../lib/supabase';
import { checkAdmin } from '../../../../../lib/check-admin';

// Дозволені адреси відправника + підпис для кожної (app_settings.mail_signatures,
// JSON {email: текст}). Віддаємо разом, щоб вікно листа робило один запит.
export async function GET() {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const [senders, { data: row }] = await Promise.all([
      getSendAddresses(),
      createServiceClient().from('app_settings').select('value').eq('key', 'mail_signatures').maybeSingle(),
    ]);

    let sig: Record<string, string> = {};
    try {
      const p = JSON.parse(row?.value || '{}');
      if (p && typeof p === 'object' && !Array.isArray(p)) sig = p;
    } catch { /* ignore */ }

    return NextResponse.json({
      senders: senders.map(s => ({ ...s, signature: sig[s.email] ?? '' })),
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
