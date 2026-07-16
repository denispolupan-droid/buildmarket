import { NextRequest, NextResponse } from 'next/server';

const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  // Settings' "Перевірити" button passes the not-yet-saved key here to test it before saving —
  // everyone else falls back to the configured key (app_settings, checked by the caller, or env).
  const { _apiKeyOverride, ...rest } = body as { _apiKeyOverride?: string } & Record<string, unknown>;
  const apiKey = _apiKeyOverride || process.env.NOVA_POSHTA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Nova Poshta API key not configured' }, { status: 500 });
  }

  try {
    const response = await fetch(NP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, ...rest }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `Nova Poshta upstream error: ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[novaposhta route]', err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 502 }
    );
  }
}
