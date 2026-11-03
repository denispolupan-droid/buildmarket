import { NextResponse } from 'next/server';
import { PROMO } from '../../promo.config';
import { createServiceClient } from '../../../lib/supabase-service';
import { withApi } from '../../../lib/api-handler';

const serviceClient = createServiceClient();

async function _GET() {
  const { data } = await serviceClient
    .from('app_settings')
    .select('value')
    .eq('key', 'promo_config')
    .single();

  if (data?.value) {
    try {
      return NextResponse.json(JSON.parse(data.value));
    } catch {}
  }
  return NextResponse.json(PROMO);
}

export const GET = withApi('promo', _GET);
