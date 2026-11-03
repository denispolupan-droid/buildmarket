import { NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { withApi } from '../../../../lib/api-handler';

async function _GET() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fixline.com.ua'));
}

export const GET = withApi('auth/signout', _GET);
