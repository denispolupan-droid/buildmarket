import { NextRequest, NextResponse } from 'next/server';
import { saveTokens } from '../../../../../../lib/zoho-mail';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';

export async function GET(req: NextRequest) {
  const site = process.env.NEXT_PUBLIC_SITE_URL;

  // Require an admin session (the callback carries first-party cookies) …
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.redirect(`${site}/admin/mail?error=unauthorized`);
  }

  // … and verify the CSRF state set in the authorize step.
  const state       = req.nextUrl.searchParams.get('state');
  const cookieState = req.cookies.get('mail_oauth_state')?.value;
  if (!state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(`${site}/admin/mail?error=bad_state`);
  }

  const code  = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL}/admin/mail?error=${encodeURIComponent(error ?? 'no_code')}`,
    );
  }

  const res = await fetch('https://accounts.zoho.eu/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      redirect_uri:  process.env.ZOHO_REDIRECT_URI!,
      grant_type:    'authorization_code',
    }),
  });

  const data = await res.json();
  if (!data.access_token || !data.refresh_token) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL}/admin/mail?error=${encodeURIComponent(JSON.stringify(data))}`,
    );
  }

  await saveTokens(data.access_token, data.refresh_token, data.expires_in ?? 3600);
  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/admin/mail?connected=1`);
}
