import { NextResponse } from 'next/server';
import { getProductsCached, getCategoriesCached } from '../../../lib/supabase';

export const revalidate = 60;

export async function GET() {
  const [products, categories] = await Promise.all([
    getProductsCached(),
    getCategoriesCached(),
  ]);

  return NextResponse.json({ products, categories }, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
