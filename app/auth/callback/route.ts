import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { getRole } from '../../../lib/user-role';

// Supabase redirects here after email confirmation
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      const role = getRole(user);

      // Redirect based on role after email confirmation
      if (role === 'dropship') {
        // Sync partner profile first
        const response = NextResponse.redirect(`${origin}/cabinet`);
        return response;
      }
      if (user?.user_metadata?.role === 'admin') {
        return NextResponse.redirect(`${origin}/admin`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
