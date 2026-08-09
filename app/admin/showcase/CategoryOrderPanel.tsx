'use client';

import { useCallback, useEffect, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { showToast } from '../../../lib/toast';
import { HOME_CATEGORY_CARDS } from '../../../lib/home-categories';
import { reorderList } from '../../../lib/reorder';
import { useDragOrder } from './useDragOrder';

/**
 * Порядок кореневих категорій. Перші HOME_CATEGORY_CARDS ідуть великими
 * картками на головній, решта — пігулками під ними. Порядок пишеться в
 * categories.sort_order, тож він же діє в сайдбарі магазину й каталогу.
 */

type Row = { slug: string; name: string; sortOrder: number; products: number };

export default function CategoryOrderPanel({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows]       = useState<Row[]>([]);
  const [order, setOrder]     = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const { rowProps, rowStyle } = useDragOrder(order, setOrder);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch('/api/admin/categories/order').then(r => r.json());
      const list: Row[] = d.categories ?? [];
      setRows(list);
      setOrder(list.map(c => c.slug));
    } catch {
      showToast('Не вдалося завантажити категорії', 'error');
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const bySlug = new Map(rows.map(r => [r.slug, r]));
  const dirty = order.join(',') !== rows.map(r => r.slug).join(',');

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/categories/order', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slugs: order }),
      });
      const d = await res.json();
      if (!res.ok) { showToast(d.error ?? 'Помилка збереження', 'error'); return; }
      setRows(d.categories ?? []);
      setOrder((d.categories ?? []).map((c: Row) => c.slug));
      showToast('Порядок категорій збережено', 'success');
    } catch {
      showToast('Помилка мережі', 'error');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
        Перші <b>{HOME_CATEGORY_CARDS}</b> категорій показуються на головній великими картками,
        решта — компактними пігулками під ними. Цей же порядок діє в сайдбарі магазину та каталогу.
        {canEdit && <> Порядок міняйте перетягуванням рядка або стрілками.</>}
      </div>

      {loading ? (
        <div style={{ padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>Завантаження…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {order.map((slug, i) => {
            const c = bySlug.get(slug);
            const isCard = i < HOME_CATEGORY_CARDS;
            return (
              <div key={slug}
                {...(canEdit ? rowProps(i) : {})}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
                  borderTop: i > 0 ? '1px solid var(--border-light)' : 'none',
                  background: isCard ? 'rgba(30,58,95,0.04)' : 'transparent',
                  ...(canEdit ? rowStyle(i) : {}),
                }}>
                {canEdit && <GripVertical size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                <span style={{ width: 26, fontSize: 12, fontWeight: 700, color: '#1E3A5F' }}>{i + 1}.</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{c?.name ?? slug}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    <span style={{ fontFamily: 'monospace' }}>{slug}</span>
                    {c ? ` · ${c.products} товарів у наявності каталогу` : ''}
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap',
                  background: isCard ? '#1E3A5F' : 'var(--bg-soft)',
                  color: isCard ? '#fff' : 'var(--text-secondary)',
                  border: isCard ? 'none' : '1px solid var(--border)',
                }}>
                  {isCard ? 'картка' : 'пігулка'}
                </span>
                {canEdit && (
                  <>
                    <button onClick={() => setOrder(o => reorderList(o, i, i - 1))} disabled={i === 0} style={miniBtn} title="Вище">↑</button>
                    <button onClick={() => setOrder(o => reorderList(o, i, i + 1))} disabled={i === order.length - 1} style={miniBtn} title="Нижче">↓</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canEdit && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <button onClick={save} disabled={saving || !dirty}
            style={{ height: 36, padding: '0 18px', borderRadius: 8, border: 'none', background: '#1E3A5F', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving || !dirty ? 'default' : 'pointer', opacity: saving || !dirty ? 0.5 : 1 }}>
            {saving ? 'Зберігаю…' : 'Зберегти порядок'}
          </button>
          {dirty && (
            <button onClick={() => setOrder(rows.map(r => r.slug))}
              style={{ height: 36, padding: '0 14px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Скасувати зміни
            </button>
          )}
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            {dirty ? 'є незбережені зміни' : 'збережено'}
          </span>
        </div>
      )}
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)',
  color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', flexShrink: 0,
};
