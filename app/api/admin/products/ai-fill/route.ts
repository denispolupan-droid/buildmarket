import { NextRequest } from 'next/server';
import { checkAdmin } from '../../../../../lib/check-admin';
import { fillProducts } from '../../../../../lib/product-ai-filler';

export const runtime     = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!await checkAdmin()) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const { skus, fields } = await req.json() as {
    skus: string[];
    fields?: { description?: boolean; description_full?: boolean; keywords?: boolean; characteristics?: boolean };
  };
  if (!Array.isArray(skus) || skus.length === 0) {
    return new Response(JSON.stringify({ error: 'skus required' }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        for await (const event of fillProducts(skus, fields)) {
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
