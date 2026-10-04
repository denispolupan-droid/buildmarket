/**
 * Перевірка фото товарів: чи існує файл, на який посилається products.image.
 *
 * Фото живуть у R2 (шлях /img/products/<key> → R2-об'єкт <key>), частина старих —
 * у public/img/products репозиторію. Бите посилання з'являлося, коли старий файл
 * стирали з R2, а товар (або сусідній товар зі спільним фото) ще на нього посилався
 * (04.10.2026: 5 товарів, серед них 1000-007 Pattex Crystall). Скрипт показує такі
 * товари й, за наявності, альтернативні файли того ж SKU в R2.
 *
 * Використання:
 *   npx tsx --env-file=.env.local scripts/check-product-images.ts            # лише активні
 *   npx tsx --env-file=.env.local scripts/check-product-images.ts --all      # разом із вимкненими
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { r2Client } from '../lib/r2';
import { createServiceClient } from '../lib/supabase';
import { fetchAllRows } from '../lib/db-paginate';

const ALL = process.argv.includes('--all');
const PREFIX = '/img/products/';

async function listR2Keys(): Promise<Map<string, Date>> {
  const keys = new Map<string, Date>();
  let token: string | undefined;
  do {
    const res = await r2Client.send(new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME!, ContinuationToken: token,
    }));
    for (const o of res.Contents ?? []) if (o.Key) keys.set(o.Key, o.LastModified ?? new Date(0));
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function main() {
  const db = createServiceClient();
  const [keys, rows] = await Promise.all([
    listR2Keys(),
    fetchAllRows<{ sku: string; image: string | null; is_active: boolean }>((f, t) =>
      db.from('products').select('sku, image, is_active').order('id').range(f, t)),
  ]);
  const products = ALL ? rows : rows.filter(r => r.is_active);

  const broken = products.filter(r => {
    if (!r.image?.startsWith(PREFIX)) return false;
    const key = r.image.slice(PREFIX.length);
    return !keys.has(key) && !existsSync(join(process.cwd(), 'public', 'img', 'products', key));
  });
  const noImage = products.filter(r => !r.image);

  console.log(`Товарів перевірено: ${products.length}, об'єктів у R2: ${keys.size}`);
  console.log(`Без фото: ${noImage.length}${noImage.length ? ' — ' + noImage.map(r => r.sku).join(', ') : ''}`);
  console.log(`Биті посилання: ${broken.length}`);
  for (const r of broken) {
    console.log(`  ${r.sku}  ${r.image}`);
    const alt = [...keys.entries()].filter(([k]) => k.includes(`/${r.sku}-`) || k.includes(`/${r.sku}.`));
    for (const [k, d] of alt) console.log(`      є в R2: ${k} (${d.toISOString().slice(0, 10)})`);
  }
  process.exitCode = broken.length ? 1 : 0;
}

main().catch(e => { console.error(e); process.exit(1); });
