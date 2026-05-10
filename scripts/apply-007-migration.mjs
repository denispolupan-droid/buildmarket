import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const sql = `
  ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS payment_confirmed boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS callback_done     boolean DEFAULT false;
`;

const { error } = await supabase.rpc('exec_sql', { sql }).catch(() => ({ error: 'rpc not available' }));
if (error) {
  // Fallback: try direct query
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ sql }),
  });
  console.log('Response status:', res.status);
}

console.log('Migration 007 applied: payment_confirmed, callback_done columns added');
