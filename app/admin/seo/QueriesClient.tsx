'use client';

import { useState } from 'react';
import BoostPanel from './BoostPanel';
import QueriesTable from './QueriesTable';
import HelpBox from './HelpBox';
import { HELP_QUERIES } from './help-content';
import { useSeoActions } from './use-seo-actions';

export default function QueriesClient() {
  const { actions, reload } = useSeoActions();
  const [query, setQuery] = useState('');
  const [skus, setSkus] = useState('');

  function pick(q: string, sku: string) {
    setQuery(q);
    setSkus(sku);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <>
      <HelpBox content={HELP_QUERIES} />
      <BoostPanel query={query} setQuery={setQuery} skus={skus} setSkus={setSkus} onDone={reload} />
      <QueriesTable actions={actions} onPick={pick} />
    </>
  );
}
