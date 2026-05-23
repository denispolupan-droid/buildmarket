import { NextResponse } from 'next/server';
import { getTokenRow } from '../../../../../lib/zoho-mail';
import { checkAdmin } from '../../../../../lib/check-admin';

export async function GET() {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const row = await getTokenRow();
  return NextResponse.json({ connected: !!row });
}
