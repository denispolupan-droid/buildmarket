import { NextResponse } from 'next/server';
import { getTokenRow } from '../../../../../lib/zoho-mail';

export async function GET() {
  const row = await getTokenRow();
  return NextResponse.json({ connected: !!row });
}
