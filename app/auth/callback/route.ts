import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { getRole } from '../../../lib/user-role';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type SignupMeta = { company_name?: string; contact_person?: string; phone?: string; city?: string; tax_number?: string };

async function ensureCustomerRecord(userId: string, role: 'dropship' | 'wholesale', user: { email?: string; user_metadata?: SignupMeta }) {
  const { data: existing } = await serviceClient
    .from('customers')
    .select('id')
    .eq('auth_user_id', userId)
    .single();

  if (!existing) {
    const isDropship = role === 'dropship';
    const meta = user.user_metadata ?? {};
    await serviceClient.from('customers').insert({
      auth_user_id: userId,
      type:         isDropship ? 'dropship_partner' : 'wholesale',
      price_tier:   isDropship ? 'drop' : 'wholesale',
      name:         meta.contact_person || meta.company_name || user.email || 'Клієнт',
      company:      meta.company_name || null,
      phone:        meta.phone || null,
      city:         meta.city || null,
      tax_number:   meta.tax_number || null,
      email:        user.email,
      is_active:    true,
      balance:      0,
      balance_held: 0,
    });
  }
}

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

      if (role === 'dropship' || role === 'wholesale') {
        await ensureCustomerRecord(user!.id, role, user!);
      }

      if (role === 'dropship') {
        return NextResponse.redirect(`${origin}/cabinet`);
      }
      if (user?.user_metadata?.role === 'admin') {
        return NextResponse.redirect(`${origin}/admin`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
