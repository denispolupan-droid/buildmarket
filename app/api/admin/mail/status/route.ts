import { NextResponse } from 'next/server';
import { getTokenRow } from '../../../../../lib/zoho-mail';
import { requireStaff } from '../../../../../lib/auth-guard';

export async function GET() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const row = await getTokenRow();
  return NextResponse.json({ connected: !!row });
}
