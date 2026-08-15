import { NextRequest } from 'next/server';
import { checkAdmin } from '../../../../../lib/check-admin';
import { fillProducts } from '../../../../../lib/product-ai-filler';
import { logSeoAction } from '../../../../../lib/seo-actions';
import { createClient } from '@supabase/supabase-js';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const runtime     = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!await checkAdmin()) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const { skus, fields, force, targetQuery } = await req.json() as {
    skus: string[];
    fields?: { description?: boolean; description_full?: boolean; keywords?: boolean; characteristics?: boolean; description_mp?: boolean };
    force?: boolean;
    /** «Дожим» із розділу SEO: контент цілиться в цей пошуковий запит */
    targetQuery?: string;
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
        for await (const event of fillProducts(skus, fields, !!force, targetQuery?.trim() || undefined)) {
          send(event);
          // Дожим під запит фіксуємо в журналі SEO — щоб у розділі було видно,
          // що картку вже переписували, і не платити за це вдруге.
          if (event.type === 'result' && targetQuery?.trim()) {
            // Ключ журналу — ЧПУ-слаг: саме він приходить зі сторінками в GSC,
            // за SKU рядок історії не знайшовся б.
            const { data: p } = await serviceClient
              .from('products').select('slug').eq('sku', event.sku).maybeSingle();
            await logSeoAction({
              page: `/product/${p?.slug ?? event.sku}`,
              action: 'product_boost',
              query: targetQuery,
              meta: { sku: event.sku, force: !!force },
              cost: event.costUsd,
            });
          }
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
