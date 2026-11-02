import { revalidateTag } from 'next/cache';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { safeEqual } from '../../../lib/safe-equal';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (!safeEqual(searchParams.get('secret'), process.env.REVALIDATE_SECRET)) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }
  revalidateTag('brands', 'max');
  revalidateTag('categories', 'max');
  revalidateTag('products', 'max');
  revalidatePath('/');
  return NextResponse.json({ revalidated: true, ts: Date.now() });
}
