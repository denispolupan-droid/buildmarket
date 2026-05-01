import { NextResponse, type NextRequest } from 'next/server';
import { getProductsCached, getCategoriesCached } from '../../../lib/supabase';

export const revalidate = 60;

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get('category');

  const [products, categories] = await Promise.all([
    getProductsCached(category ? { category } : undefined),
    getCategoriesCached(),
  ]);

  return NextResponse.json({ products, categories }, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
