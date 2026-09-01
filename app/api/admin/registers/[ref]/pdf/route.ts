import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { getNpApiKey, npCall, npScanSheetPdf } from '../../../../../../lib/np-api';

/**
 * Друк реєстру НП — офіційна форма з my.novaposhta.ua, та сама, що друкує кабінет
 * (штрихкод реєстру, перелік ЕН, відправник, підписи). Раніше тут була власна HTML-
 * верстка зі списком ЕН через getDocumentList — оператори на відділенні її не
 * приймали як реєстр. Рішення власника 01.09.2026: друкувати як з кабінету.
 *
 * Побічний ефект той самий, що і в кабінеті: після друку НП ставить реєстру Printed=1
 * і нові ЕН у нього вже не додати — тому кнопка друку йде ПІСЛЯ «Додати в реєстр».
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const { ref } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(ref)) return new NextResponse('Некоректний Ref реєстру', { status: 400 });

  const apiKey = await getNpApiKey();

  // Номер реєстру — лише для імені файлу; якщо НП не відповіла, друкуємо без нього
  let number = '';
  try {
    const sheet = await npCall<{ Number?: string }>(apiKey, 'ScanSheet', 'getScanSheet', { Ref: ref });
    number = String(sheet.data?.[0]?.Number ?? '').replace(/[^0-9A-Za-z-]/g, '');
  } catch { /* не критично */ }

  try {
    const pdf = await npScanSheetPdf(apiKey, [ref]);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="np-register-${number || ref.slice(0, 8)}.pdf"`,
        'Cache-Control':       'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не вдалося отримати PDF реєстру від НП';
    return new NextResponse(message, { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
