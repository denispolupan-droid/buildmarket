import { NextRequest, NextResponse } from 'next/server';
import { withNpRetry } from '../../../lib/np-retry';
import { requireStaff } from '../../../lib/auth-guard';
import { withApi } from '../../../lib/api-handler';
import { getNpApiKey } from '../../../lib/np-api';

const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

// Публічний (гостьовий checkout) доступ до серверного ключа NP — лише довідникові
// звернення адресної книги. Без allowlist цей проксі дозволяв би викликати будь-яку
// операцію акаунту (перебір контрагентів, створення документів, спалення квоти).
const PUBLIC_METHODS = new Set([
  'Address.searchSettlements',
  'Address.getWarehouses',
]);

async function _POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  // Settings' "Перевірити" button passes the not-yet-saved key here to test it before saving —
  // everyone else uses the configured key: Vault (lib/secrets, np_api_key) — не env.
  // 03.11.2026: роут читав ЛИШЕ process.env.NOVA_POSHTA_API_KEY (ключ іншого кабінету);
  // коли змінну прибрали, модалка ТТН і вибір відділення на сайті лишились без довідника.
  // Власний ключ — лише адміну: інакше роут був би анонімним релеєм до API НП
  // з будь-яким ключем (аудит 31.10, §5 Low).
  const { _apiKeyOverride, ...rest } = body as { _apiKeyOverride?: string } & Record<string, unknown>;
  if (_apiKeyOverride) {
    const auth = await requireStaff('admin');
    if (!auth.ok) return auth.response;
  }
  const apiKey = _apiKeyOverride || await getNpApiKey();
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
    // «To many requests» від НП повторюємо з паузою тут, у проксі, — тоді це
    // покриває всіх клієнтів (модалка ТТН, вибір відділення, кошик) одразу.
    const data = await withNpRetry(async () => {
      const response = await fetch(NP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, ...rest }),
      });
      if (!response.ok) return { success: false, errors: [], _upstreamStatus: response.status };
      return response.json() as Promise<{ success?: boolean; errors?: unknown[]; _upstreamStatus?: number }>;
    });

    if (data._upstreamStatus) {
      return NextResponse.json(
        { success: false, error: `Nova Poshta upstream error: ${data._upstreamStatus}` },
        { status: 502 }
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[novaposhta route]', err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 502 }
    );
  }
}

export const POST = withApi('novaposhta', _POST);
