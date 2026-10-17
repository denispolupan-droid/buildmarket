import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';

// Вимикач автопілота чернеток (lib/blog-autodraft, крон 1-го і 15-го):
// app_settings.blog_autodraft_per_run — 0 = на паузі, 1 = одна чернетка за прогін.
const KEY = 'blog_autodraft_per_run';

export async function GET() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const db = createServiceClient();
  const [{ data: setting }, { data: last }] = await Promise.all([
    db.from('app_settings').select('value').eq('key', KEY).maybeSingle(),
    db.from('seo_actions').select('created_at, page_path, meta')
      .eq('action', 'article_new').eq('created_by', 'autodraft')
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  // Без рядка в app_settings автопілот працює з дефолтом 1 (див. settings() у blog-autodraft)
  const perRun = Number(setting?.value ?? '1') || 0;
  return NextResponse.json({
    enabled: perRun > 0,
    lastDraft: last ? { at: last.created_at, page: last.page_path, title: (last.meta as { title?: string } | null)?.title ?? null } : null,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({})) as { enabled?: boolean };
  const enabled = body.enabled === true;
  const db = createServiceClient();
  const { error } = await db.from('app_settings').upsert({ key: KEY, value: enabled ? '1' : '0' }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, enabled });
}
