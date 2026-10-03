import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { applyCardFollowUps, proposeProductCard } from '../../../../../lib/product-card-proposer';
import { markAgentRunOutcome } from '../../../../../lib/ai-agent-runs';

// Чернетка картки товару від ШІ-агента за назвою з прайсу постачальника.
// У БД нічого не пише: форма нового товару заповнюється пропозицією, зберігає
// менеджер звичайним POST /api/admin/products.

// Агент шукає технічний лист виробника в вебі — живий прогін 03.10: 48–71 с.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({})) as {
    name?: string; supplierSku?: string | null; supplierTitle?: string | null;
    priceCost?: number | null; brand?: string | null;
  };
  const name = (body.name ?? '').trim();
  if (name.length < 3) return NextResponse.json({ error: 'Вкажіть назву позиції від постачальника' }, { status: 400 });
  if (name.length > 300) return NextResponse.json({ error: 'Назва задовга' }, { status: 400 });

  try {
    const run = await proposeProductCard({
      supplierName: name,
      supplierSku: body.supplierSku ?? null,
      supplierTitle: body.supplierTitle ?? null,
      priceCost: typeof body.priceCost === 'number' && body.priceCost > 0 ? body.priceCost : null,
      brandHint: body.brand?.trim() || null,
    }, { createdBy: auth.user.email ?? null });
    return NextResponse.json(run);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[products/propose]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Після збереження картки з чернетки: лінійка сусіда, маппінг коду
// постачальника, журнал агента. Або «відкинуто» — лише журнал.
export async function PATCH(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({})) as {
    runId?: string | null; outcome?: string; sku?: string | null;
    siblingSku?: string | null; supplierId?: number | null; supplierSku?: string | null;
  };
  if (!['applied', 'discarded'].includes(body.outcome ?? '')) {
    return NextResponse.json({ error: 'Невірні параметри' }, { status: 400 });
  }
  try {
    if (body.outcome === 'applied') {
      if (!body.sku) return NextResponse.json({ error: 'Потрібен SKU збереженого товару' }, { status: 400 });
      const res = await applyCardFollowUps({
        sku: body.sku, runId: body.runId ?? null, siblingSku: body.siblingSku ?? null,
        supplierId: typeof body.supplierId === 'number' ? body.supplierId : null, supplierSku: body.supplierSku ?? null,
      });
      return NextResponse.json({ ok: true, ...res });
    }
    if (body.runId) await markAgentRunOutcome(body.runId, 'discarded', null);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[products/propose PATCH]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
