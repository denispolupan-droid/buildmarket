import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';

const SCOPES = [
  'ZohoMail.messages.ALL',
  'ZohoMail.folders.ALL',
  'ZohoMail.accounts.READ',
].join(',');

export async function GET() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

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
