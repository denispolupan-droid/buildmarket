import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PROMO } from '../../promo.config';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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
