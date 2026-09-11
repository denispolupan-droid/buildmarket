import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { pushEpicentrOffers } from '../../../../../lib/epicentr-offers-push';

// Ручний пуш цін і наявності в Епіцентр через /v1/offers (кнопка на дашборді).
export async function POST() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await pushEpicentrOffers());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
