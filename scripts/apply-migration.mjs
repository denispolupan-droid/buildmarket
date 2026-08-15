#!/usr/bin/env node
/**
 * Застосування міграції через Supabase Management API.
 *
 *   node scripts/apply-migration.mjs 097_product_seo_state.sql            # prod + test
 *   node scripts/apply-migration.mjs 097_product_seo_state.sql test       # тільки test
 *
 * Схема правиться ТІЛЬКИ файлами supabase/migrations (конвенція проєкту), а
 * після застосування на prod test синкається одразу — інакше вони розʼїжджаються
 * і наступна міграція падає на одному з них.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, '../.env.local') });

const PROJECTS = {
  prod: 'boaztnparrdoeknajprn',
  test: 'mdrextghmuzkyelpqsgp',
};

const [file, only] = process.argv.slice(2);
if (!file) {
  console.error('usage: node scripts/apply-migration.mjs <file.sql> [prod|test]');
  process.exit(1);
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN не заданий у .env.local');
  process.exit(1);
}

const sql = readFileSync(join(here, '../supabase/migrations', file), 'utf8');
const targets = only ? [only] : ['prod', 'test'];

for (const target of targets) {
  const ref = PROJECTS[target];
  if (!ref) {
    console.error(`невідома ціль: ${target}`);
    process.exit(1);
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`✗ ${target} (${ref}): ${res.status} ${body}`);
    process.exit(1);
  }
  console.log(`✓ ${target} (${ref}) — ${file}`);
}
