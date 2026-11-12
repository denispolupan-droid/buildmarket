/**
 * Сторож довідника атрибутів Епіцентру (12.11.2026).
 *
 * Фід і агент заведення товару читають lib/data/epicentr-attributes.json — знімок
 * довідника на момент scripts/epicentr-attributes-sync.mts. Епіцентр додає
 * обов'язкові поля без попередження (листопад: «Колір» 9993, «Об'єм» 14934,
 * «Вага» 14933), і знімок мовчки застаріває: картки зависають у «Чернетках».
 * Щотижня звіряємо обов'язковість атрибутів наших наборів із живим API;
 * розбіжність — Telegram з командою оновлення. Чистий модуль — порівняння під тестами.
 */

import data from './data/epicentr-attributes.json';
import { epicentrFetch } from './epicentr-api';

type Tr = { languageCode: string; title?: string };
type LiveAttr = { code: string; type: string; isSystem: boolean; isRequired: boolean; translations: Tr[] };
export type LiveSet = { code: string; attributes: LiveAttr[] };
type SnapAttr = { code: string; required: boolean; system: boolean; title: string };
type SnapSet = { code: string; title: string; attributes: SnapAttr[] };

export type AttrDrift = {
  set: string; setTitle: string; code: string; title: string;
  kind: 'new_required' | 'became_required' | 'no_longer_required' | 'removed' | 'set_missing';
};

const ua = (trs: Tr[] | undefined) => (trs ?? []).find(t => t.languageCode === 'ua')?.title ?? (trs ?? [])[0]?.title ?? '';

/** Що змінилось у живому довіднику відносно знімка (лише те, що впливає на фід). */
export function compareAttributeSets(snapshot: SnapSet[], live: LiveSet[]): AttrDrift[] {
  const out: AttrDrift[] = [];
  const liveBy = new Map(live.map(s => [String(s.code), s]));
  for (const snap of snapshot) {
    const l = liveBy.get(String(snap.code));
    if (!l) { out.push({ set: snap.code, setTitle: snap.title, code: '', title: '', kind: 'set_missing' }); continue; }
    const snapBy = new Map(snap.attributes.map(a => [a.code, a]));
    const liveAttrs = new Map(l.attributes.map(a => [a.code, a]));
    for (const a of l.attributes) {
      if (a.isSystem || !a.isRequired) continue;
      const was = snapBy.get(a.code);
      if (!was) out.push({ set: snap.code, setTitle: snap.title, code: a.code, title: ua(a.translations), kind: 'new_required' });
      else if (!was.required) out.push({ set: snap.code, setTitle: snap.title, code: a.code, title: was.title, kind: 'became_required' });
    }
    for (const a of snap.attributes) {
      if (a.system) continue;
      const now = liveAttrs.get(a.code);
      if (!now) { if (a.required) out.push({ set: snap.code, setTitle: snap.title, code: a.code, title: a.title, kind: 'removed' }); }
      else if (a.required && !now.isRequired) out.push({ set: snap.code, setTitle: snap.title, code: a.code, title: a.title, kind: 'no_longer_required' });
    }
  }
  return out;
}

export function snapshotSets(): SnapSet[] {
  return (data as { sets: SnapSet[] }).sets;
}

/** Живі набори з API (без опцій — лише атрибути й обов'язковість; ~1 запит на 50 наборів). */
export async function loadLiveAttributeSets(codes: string[]): Promise<LiveSet[]> {
  const out: LiveSet[] = [];
  const uniq = [...new Set(codes)];
  for (let i = 0; i < uniq.length; i += 50) {
    const q = uniq.slice(i, i + 50).map(c => `filter[codes][]=${encodeURIComponent(c)}`).join('&');
    const page = await epicentrFetch<{ items?: LiveSet[] }>(`/v2/pim/attribute-sets?limit=100&${q}`);
    out.push(...(page?.items ?? []));
  }
  return out;
}

const KIND_LABEL: Record<AttrDrift['kind'], string> = {
  new_required: 'нове обовʼязкове',
  became_required: 'стало обовʼязковим',
  no_longer_required: 'більше не обовʼязкове',
  removed: 'прибрано',
  set_missing: 'набір не знайдено',
};

export function driftText(d: AttrDrift[]): string {
  return d.slice(0, 25).map(x => `• ${x.setTitle} (${x.set})${x.code ? `: ${x.title} [${x.code}]` : ''} — ${KIND_LABEL[x.kind]}`).join('\n')
    + (d.length > 25 ? `\n…ще ${d.length - 25}` : '');
}
