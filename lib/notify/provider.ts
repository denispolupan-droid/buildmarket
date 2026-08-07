import { createServiceClient } from '../supabase';

// Провайдер розсилки Viber/SMS. Інтерфейс навмисно вузький: усе, що нам треба, —
// «надішли текст на номер і скажи, яким каналом дійшло».
//
// Налаштування живуть в app_settings, а не в env: змінити відправника чи
// вимкнути розсилку має бути можливо без редеплою — так само, як зроблено з
// ключем Нової Пошти. Поки провайдер не налаштований, dispatcher нічого не шле
// й пише 'skipped' — тобто код можна викотити в прод до підписання договору.

export type SendResult =
  | { ok: true;  channel: 'viber' | 'sms'; messageId?: string }
  | { ok: false; error: string };

export type NotifyConfig = {
  provider: 'turbosms' | 'none';
  apiKey: string;
  smsSender: string;      // альфа-імʼя, зареєстроване в операторів
  viberSender: string;    // імʼя відправника Viber (може бути порожнім)
  enabled: boolean;
};

export async function getNotifyConfig(): Promise<NotifyConfig> {
  const db = createServiceClient();
  const { data } = await db
    .from('app_settings')
    .select('key, value')
    .in('key', ['notify_provider', 'notify_api_key', 'notify_sms_sender', 'notify_viber_sender', 'notify_enabled']);

  const cfg: Record<string, string> = {};
  for (const row of data ?? []) cfg[row.key as string] = (row.value as string ?? '').trim();

  const provider = cfg.notify_provider === 'turbosms' ? 'turbosms' : 'none';
  const apiKey = cfg.notify_api_key ?? '';
  return {
    provider,
    apiKey,
    smsSender:   cfg.notify_sms_sender ?? '',
    viberSender: cfg.notify_viber_sender ?? '',
    // Вимикач окремо від наявності ключів: щоб можна було швидко зупинити
    // розсилку, не стираючи налаштувань.
    enabled: provider !== 'none' && !!apiKey && cfg.notify_enabled !== 'false',
  };
}

/**
 * TurboSMS: один виклик надсилає каскадом — спершу Viber, і лише якщо він не
 * дійшов, SMS. Саме заради цього каскаду й обрано такий формат: Viber дешевший
 * у рази, а SMS лишається гарантією доставки.
 */
async function sendViaTurboSms(cfg: NotifyConfig, phone: string, text: string): Promise<SendResult> {
  try {
    const res = await fetch('https://api.turbosms.ua/message/send.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        recipients: [phone],
        sms:   { sender: cfg.smsSender, text },
        ...(cfg.viberSender ? { viber: { sender: cfg.viberSender, text, ttl: 300 } } : {}),
      }),
    });

    const data = await res.json().catch(() => null) as
      | { response_code?: number; response_status?: string; response_result?: { phone?: string; message_id?: string; response_status?: string }[] }
      | null;

    if (!res.ok || !data) return { ok: false, error: `HTTP ${res.status}` };
    // 0 і 800 — «прийнято до відправки»; решта кодів — відмова з поясненням у статусі
    if (data.response_code !== 0 && data.response_code !== 800) {
      return { ok: false, error: `${data.response_code}: ${data.response_status ?? 'відмова'}` };
    }

    const first = data.response_result?.[0];
    return { ok: true, channel: cfg.viberSender ? 'viber' : 'sms', messageId: first?.message_id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendMessage(cfg: NotifyConfig, phone: string, text: string): Promise<SendResult> {
  if (!cfg.enabled) return { ok: false, error: 'провайдер не налаштований' };
  if (cfg.provider === 'turbosms') return sendViaTurboSms(cfg, phone, text);
  return { ok: false, error: `невідомий провайдер: ${cfg.provider}` };
}
