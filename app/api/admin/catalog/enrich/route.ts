import { NextRequest } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { enrichCatalog } from '../../../../../lib/catalog-enricher';

export const runtime    = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const { limit = 10, category, sku, skus, targetQuery } = await req.json() as {
    limit?: number;
    category?: string;
    sku?: string;
    skus?: string[];
    targetQuery?: string;
  };

  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        for await (const event of enrichCatalog({ limit, category, sku, skus, targetQuery })) {
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
