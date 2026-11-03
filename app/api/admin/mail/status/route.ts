import { NextResponse } from 'next/server';
import { getTokenRow } from '../../../../../lib/zoho-mail';
import { requireStaff } from '../../../../../lib/auth-guard';
import { withApi } from '../../../../../lib/api-handler';

async function _GET() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const row = await getTokenRow();
  return NextResponse.json({ connected: !!row });
}

export const GET = withApi('admin/mail/status', _GET);
