import { NextResponse } from 'next/server';
import { PROMO } from '../../promo.config';
import { createServiceClient } from '../../../lib/supabase-service';

const serviceClient = createServiceClient();

export async function GET() {
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
