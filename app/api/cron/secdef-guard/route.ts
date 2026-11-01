import { NextRequest, NextResponse } from 'next/server';
import { alertAdmin } from '../../../../lib/alert';
import { cronAuthorized } from '../../../../lib/cron-auth';
import { createServiceClient } from '../../../../lib/supabase-service';

// Щоденний гейт: чи є публічні SECURITY DEFINER функції, доступні anon/authenticated
// через /rest/v1/rpc (тобто новостворені функції без REVOKE — саме так у прод потрапили
// open_period/close_period). Крутиться на проді (service_role, prod-ключі в CI не потрібні),
// дьоргається з GitHub Actions за CRON_SECRET; при знахідці — алерт у Telegram.

const serviceClient = createServiceClient();

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!cronAuthorized(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await serviceClient.rpc('check_secdef_exposure');
  if (error) {
    alertAdmin('Безпека: не вдалось перевірити secdef-функції', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const exposed = ((data ?? []) as { func: string }[]).map(r => r.func);
  if (exposed.length) {
    alertAdmin(
      '🔴 Безпека: SECURITY DEFINER функції відкриті для anon/authenticated',
      `Викликаються публічно через /rest/v1/rpc — потрібен REVOKE (як у міграції 062):\n${exposed.join('\n')}`,
    );
    return NextResponse.json({ ok: false, exposed }, { status: 500 });
  }

  return NextResponse.json({ ok: true, exposed: [] });
}

export const POST = GET;
