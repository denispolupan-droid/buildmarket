import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { loadVidatkova, vidatkovaRenderParams } from '../../../lib/vidatkova-doc';
import VidatkovaNakladna from './VidatkovaNakladna';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function VidatkovaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Only staff get the send/print toolbar; clients (opening the shared link) get
  // a clean download-only view — same model as the invoice page.
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const isStaff = ['admin', 'manager'].includes(user?.app_metadata?.role ?? '');

  // Документ, рядки, покупець (реквізити з картки контрагента) і договір.
  const data = await loadVidatkova(db, id);
  if (!data) notFound();

  return (
    <VidatkovaNakladna
      {...vidatkovaRenderParams(data)}
      docId={id}
      defaultEmail={data.buyer.email}
      isStaff={isStaff}
      canEdit={user?.app_metadata?.role === 'admin'}
      docStatus={data.doc.status}
    />
  );
}

