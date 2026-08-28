'use client';

import { useState } from 'react';
import BoostPanel from './BoostPanel';
import QueriesTable, { categorySlug } from './QueriesTable';
import HelpBox from './HelpBox';
import { HELP_QUERIES } from './help-content';
import { useSeoActions } from './use-seo-actions';

export default function QueriesClient() {
  const { actions, reload } = useSeoActions();
  const [query, setQuery] = useState('');
  const [skus, setSkus] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  function pick(q: string, sku: string, path: string) {
    setQuery(q);
    setSkus(sku);
    setCategory(categorySlug(path));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <>
      <HelpBox content={HELP_QUERIES} />
      <BoostPanel query={query} setQuery={setQuery} skus={skus} setSkus={setSkus} categorySlug={category} onDone={reload} />
      <QueriesTable actions={actions} onPick={pick} />
    </>
  );
}
