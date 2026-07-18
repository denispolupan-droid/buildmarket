import { NextRequest, NextResponse } from 'next/server';

const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

// Публічний (гостьовий checkout) доступ до серверного ключа NP — лише довідникові
// звернення адресної книги. Без allowlist цей проксі дозволяв би викликати будь-яку
// операцію акаунту (перебір контрагентів, створення документів, спалення квоти).
const PUBLIC_METHODS = new Set([
  'Address.searchSettlements',
  'Address.getWarehouses',
]);

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

  // Коли використовується серверний ключ (без override) — пропускаємо тільки whitelisted методи.
  // Запити з власним ключем (адмін тестує ключ у налаштуваннях) не чіпають серверний акаунт.
  if (!_apiKeyOverride) {
    const methodKey = `${(rest as { modelName?: string }).modelName}.${(rest as { calledMethod?: string }).calledMethod}`;
    if (!PUBLIC_METHODS.has(methodKey)) {
      return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 403 });
    }
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
