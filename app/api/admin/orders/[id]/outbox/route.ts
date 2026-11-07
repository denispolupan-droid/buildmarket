import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../../lib/supabase-service';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { withApi } from '../../../../../../lib/api-handler';
import { listOutboxEvents, retryOutboxEvent } from '../../../../../../lib/outbox/sweeper';
import { parseBody } from '../../../../../../lib/validate';
import { z } from 'zod';

const db = createServiceClient();

/** Події outbox замовлення — блок «Доставка подій» у картці (docs/OUTBOX-PLAN.md, фаза 2). */
async function _GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const rows = await listOutboxEvents(db, id);
  return NextResponse.json({
    events: rows.map(r => ({
      id: r.id, event: r.event, handler: r.handler, status: r.status, attempts: r.attempts,
      next_at: r.next_at, last_error: r.last_error, created_at: r.created_at, done_at: r.done_at,
      channel: (r.payload as { channel?: string; via?: string } | null)?.channel ?? (r.payload as { via?: string } | null)?.via ?? null,
      ttn: (r.payload as { ttn?: string | null } | null)?.ttn ?? null,
      target_status: (r.payload as { status?: string } | null)?.status ?? null,
    })),
  });
}

const RetrySchema = z.object({ event_id: z.number().int().positive() });

/** Повторити подію (failed/skipped → pending): наступний тік крону її забере. */
async function _POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = await parseBody(req, RetrySchema);
  if (!body.ok) return body.response;
  // Подія має належати цьому замовленню — інакше id з іншої картки перезапустив би чужу
  const own = (await listOutboxEvents(db, id)).some(r => r.id === body.data.event_id);
  if (!own) return NextResponse.json({ error: 'Подія не належить цьому замовленню' }, { status: 404 });
  const row = await retryOutboxEvent(db, body.data.event_id);
  if (!row) return NextResponse.json({ error: 'Повторити можна лише failed або skipped' }, { status: 409 });
  return NextResponse.json({ ok: true, event: { id: row.id, status: row.status, next_at: row.next_at } });
}

export const GET = withApi('admin/orders/[id]/outbox', _GET);
export const POST = withApi('admin/orders/[id]/outbox', _POST);
