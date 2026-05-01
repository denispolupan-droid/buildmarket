import { NextResponse } from 'next/server';
import { getPreviewProductsCached, getCategoriesCached } from '../../../lib/supabase';

export const revalidate = 300;

export async function GET() {
  const categories = await getCategoriesCached();
  const allSlugs = categories.map(c => c.slug);
  const products = await getPreviewProductsCached(allSlugs, 1);

  return NextResponse.json({ products, categories }, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
