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

  // CSRF state — echoed back by Zoho and verified in the callback so an attacker
  // cannot bind their own Zoho account by luring an admin to the callback URL.
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    scope:         SCOPES,
    client_id:     process.env.ZOHO_CLIENT_ID!,
    response_type: 'code',
    redirect_uri:  process.env.ZOHO_REDIRECT_URI!,
    access_type:   'offline',
    state,
  });

  const res = NextResponse.redirect(`https://accounts.zoho.eu/oauth/v2/auth?${params}`);
  res.cookies.set('mail_oauth_state', state, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600,
  });
  return res;
}
