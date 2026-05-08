import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  if (secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }
  revalidateTag('brands');
  revalidateTag('categories');
  revalidateTag('products');
  return NextResponse.json({ revalidated: true, ts: Date.now() });
}
