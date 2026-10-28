import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { reviseDraft } from '../../../../../../lib/marketplace-chat-assistant';
import { normalizeInstruction } from '../../../../../../lib/marketplace-chat-draft-rules';
import { reportAiFailure } from '../../../../../../lib/ai-health';
import { aiFailureShort } from '../../../../../../lib/ai-health-rules';

// «Направити» відповідь: переписати поточну чернетку за вказівкою менеджера.
// На площадку нічого не пише — повертає нову чернетку.
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({})) as { draftId?: string; instruction?: string };
  if (!body.draftId || !/^[0-9a-f-]{36}$/i.test(body.draftId)) {
    return NextResponse.json({ error: 'Невідома чернетка' }, { status: 400 });
  }
  const instr = normalizeInstruction(body.instruction);
  if (!instr.ok) return NextResponse.json({ error: instr.error }, { status: 400 });

  try {
    const draft = await reviseDraft(body.draftId, instr.text, { by: auth.user.email ?? null, via: 'admin' });
    return NextResponse.json({ draft });
  } catch (err: unknown) {
    const kind = await reportAiFailure(err, '«Переписати» в адмінці');
    const message = kind === 'other' ? (err instanceof Error ? err.message : String(err)) : `Не переписано: ${aiFailureShort(kind)}`;
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
