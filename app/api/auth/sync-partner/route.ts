import { NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { getRole } from '../../../../lib/user-role';
import { ensurePartnerCustomer } from '../../../../lib/partner-customer';
import { withApi } from '../../../../lib/api-handler';

async function _POST() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = getRole(user);

  if (role !== 'dropship' && role !== 'wholesale') {
    return NextResponse.json({ role });
  }

  // Контрагент і договір — спільна логіка з /auth/callback і схваленням заявки
  const customer = await ensurePartnerCustomer(user, role);
  return NextResponse.json({ role, customer });
}

export const POST = withApi('auth/sync-partner', _POST);
