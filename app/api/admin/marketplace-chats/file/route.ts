import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { rozetkaFetchRaw } from '../../../../../lib/rozetka-api';
import { fetchPromChatFile } from '../../../../../lib/prom-api';

// Фото/файли покупців із чатів маркетплейсів. Площадки віддають їх лише з
// нашим токеном, тож браузер менеджера ходить сюди, а ми — на площадку.
// Адреса площадки не приймається від клієнта: лише id (Rozetka) або uid (Prom),
// з яких ми самі складаємо URL — щоб роут не став відкритим проксі.

const UID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 15 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const mp = sp.get('mp');
  let upstream: Response;
  try {
    if (mp === 'rozetka') {
      const id = sp.get('id') ?? '';
      if (!/^\d{1,12}$/.test(id)) return NextResponse.json({ error: 'Невірний id' }, { status: 400 });
      upstream = await rozetkaFetchRaw(`/messages/download-file/${id}`);
    } else if (mp === 'prom') {
      const uid = sp.get('uid') ?? '';
      if (!UID.test(uid)) return NextResponse.json({ error: 'Невірний uid' }, { status: 400 });
      upstream = await fetchPromChatFile(uid);
    } else {
      return NextResponse.json({ error: 'Невірна площадка' }, { status: 400 });
    }
  } catch (err) {
    console.error('[marketplace-chats/file]', err);
    return NextResponse.json({ error: 'Площадка не віддала файл' }, { status: 502 });
  }

  const ct = upstream.headers.get('content-type') ?? 'application/octet-stream';
  // Rozetka на «не знайдено» відповідає 200 з JSON-помилкою
  if (!upstream.ok || ct.includes('json')) {
    return NextResponse.json({ error: 'Файл недоступний' }, { status: 404 });
  }
  const buf = await upstream.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return NextResponse.json({ error: 'Файл завеликий' }, { status: 413 });

  // Rozetka віддає application/octet-stream навіть для JPG — визначаємо за сигнатурою,
  // інакше браузер не покаже його в <img>.
  const b = new Uint8Array(buf.slice(0, 12));
  const sniff = b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg'
    : b[0] === 0x89 && b[1] === 0x50 ? 'image/png'
    : b[0] === 0x47 && b[1] === 0x49 ? 'image/gif'
    : b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 ? 'image/webp'
    : b[0] === 0x25 && b[1] === 0x50 ? 'application/pdf'
    : null;
  return new NextResponse(buf, {
    headers: {
      'Content-Type': sniff ?? ct,
      // Лише в браузері менеджера; фото покупця не мають лягати в спільний кеш
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
