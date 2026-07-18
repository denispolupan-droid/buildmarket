import { NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';

const SCOPES = [
  'ZohoMail.messages.ALL',
  'ZohoMail.folders.READ',
  'ZohoMail.accounts.READ',
].join(',');

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = new URLSearchParams({
    scope:         SCOPES,
    client_id:     process.env.ZOHO_CLIENT_ID!,
    response_type: 'code',
    redirect_uri:  process.env.ZOHO_REDIRECT_URI!,
    access_type:   'offline',
  });

  return NextResponse.redirect(`https://accounts.zoho.eu/oauth/v2/auth?${params}`);
}
