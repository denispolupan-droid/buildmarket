import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '../../../../../lib/check-admin';
import { enrichCatalog } from '../../../../../lib/catalog-enricher';

export const runtime    = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!await checkAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { limit = 10, category, sku } = await req.json() as {
    limit?: number;
    category?: string;
    sku?: string;
  };

  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        for await (const event of enrichCatalog({ limit, category, sku })) {
          send(event);
        }
      } catch (err) {
        send({ type: 'error', sku: '', error: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  });
}
