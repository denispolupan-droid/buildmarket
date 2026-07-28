'use client';

import { useEffect, useState } from 'react';

// Блог: генерація статей AI (тільки по кнопці, ~$0.20/стаття), чернетка →
// перегляд/редагування → публікація. Нові статті йдуть у /blog без деплою.

type PostRow = {
  id: number;
  slug: string;
  title: string;
  description: string;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  read_time: number;
};

type PostFull = PostRow & {
  title_ru: string | null;
  description_ru: string | null;
  content_html: string;
  content_html_ru: string | null;
};

type PlanItem = { sku: string; label: string; price: number | null; volume: string | null };

type LinkPlan = {
  id: number; slug: string; title: string; is_published: boolean;
  categories: string[];
  picks: (PlanItem & { href: string })[];
  current: PlanItem[];
  manualLinks: boolean;
  hasBlock: boolean;
  ruMissing: boolean;
};

const COST_PER_ARTICLE = 0.20;

export default function BlogAdminClient() {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<PostFull | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch('/api/admin/blog');
    if (res.ok) setPosts(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function generate() {
    if (!topic.trim()) return;
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/admin/blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTopic('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function createManual() {
    if (!topic.trim()) return;
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/admin/blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, manual: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTopic('');
      await load();
      await openEditor(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function openEditor(id: number) {
    const res = await fetch(`/api/admin/blog?id=${id}`);
    if (res.ok) setEditing(await res.json());
  }

  async function saveEditing(publish?: boolean) {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/blog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          title: editing.title,
          title_ru: editing.title_ru,
          description: editing.description,
          description_ru: editing.description_ru,
          content_html: editing.content_html,
          content_html_ru: editing.content_html_ru,
          ...(publish !== undefined ? { is_published: publish } : {}),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(p: PostRow) {
    await fetch('/api/admin/blog', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, is_published: !p.is_published }),
    });
    await load();
  }

  async function remove(p: PostRow) {
    if (!confirm(`Видалити статтю «${p.title}»? Це незворотно.`)) return;
    await fetch(`/api/admin/blog?id=${p.id}`, { method: 'DELETE' });
    await load();
  }

  // ── Зв'язка статей з товарами (без AI, за категоріями статті) ──
  const [plans, setPlans] = useState<LinkPlan[] | null>(null);
  const [planPicked, setPlanPicked] = useState<Set<number>>(new Set());
  const [linking, setLinking] = useState(false);
  const [linkMsg, setLinkMsg] = useState('');

  async function loadPlans() {
    setLinkMsg('');
    setPlans(null);
    try {
      const res = await fetch('/api/admin/blog/link-products');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPlans(data);
      // За замовчуванням беремо все, де є що вставити і немає ручних посилань
      setPlanPicked(new Set(
        (data as LinkPlan[]).filter(p => p.picks.length && !p.manualLinks).map(p => p.id),
      ));
    } catch (err) {
      setLinkMsg(`✗ ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Ручне редагування складу товарів статті ──
  const [editSkus, setEditSkus] = useState<{ id: number; title: string; items: PlanItem[] } | null>(null);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<{ sku: string; name: string; brand: string; volume: string | null }[]>([]);
  const [savingSkus, setSavingSkus] = useState(false);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setFound([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/admin/products/search?q=${encodeURIComponent(q)}`);
      setFound(res.ok ? await res.json() : []);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  function moveItem(i: number, dir: -1 | 1) {
    setEditSkus(prev => {
      if (!prev) return prev;
      const items = [...prev.items];
      const j = i + dir;
      if (j < 0 || j >= items.length) return prev;
      [items[i], items[j]] = [items[j], items[i]];
      return { ...prev, items };
    });
  }

  async function saveSkus() {
    if (!editSkus) return;
    setSavingSkus(true);
    setLinkMsg('');
    try {
      const res = await fetch('/api/admin/blog/link-products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editSkus.id, skus: editSkus.items.map(i => i.sku) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLinkMsg(`✓ «${editSkus.title}»: збережено ${data.count} товарів`);
      setEditSkus(null);
      setSearch('');
      await loadPlans();
    } catch (err) {
      setLinkMsg(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingSkus(false);
    }
  }

  async function applyPlans() {
    if (!planPicked.size) return;
    setLinking(true);
    setLinkMsg('');
    try {
      const res = await fetch('/api/admin/blog/link-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...planPicked] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const skipped = data.skipped?.length ? `, пропущено ${data.skipped.length}` : '';
      setLinkMsg(`✓ Оновлено статей: ${data.updated.length}${skipped}`);
      await loadPlans();
    } catch (err) {
      setLinkMsg(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLinking(false);
    }
  }

  return (
    <div style={{ padding: '32px 36px 64px', overflowY: 'auto', flex: 1 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Блог</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 20px' }}>
        Генерація статті — двома мовами одразу, з FAQ і посиланнями на категорії (≈ ${COST_PER_ARTICLE.toFixed(2)}).
        Стаття створюється чернеткою — на сайт потрапляє тільки після вашої публікації.
      </p>

      {/* Генерація */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, maxWidth: 720 }}>
        <input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') generate(); }}
          disabled={generating}
          placeholder="Тема, напр.: Як розрахувати витрату фарби на кімнату"
          style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 14 }}
        />
        <button
          onClick={generate}
          disabled={generating || !topic.trim()}
          style={{ padding: '10px 22px', background: '#3DBFB8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: generating || !topic.trim() ? 0.6 : 1, whiteSpace: 'nowrap' }}
        >
          {generating ? '⏳ Генеруємо (1–2 хв)…' : '✨ Згенерувати статтю'}
        </button>
        <button
          onClick={createManual}
          disabled={generating || !topic.trim()}
          title="Порожня чернетка з цим заголовком — текст пишете самі в редакторі"
          style={{ padding: '10px 18px', background: '#fff', color: '#475569', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: generating || !topic.trim() ? 0.6 : 1, whiteSpace: 'nowrap' }}
        >
          ✍️ Створити вручну
        </button>
      </div>
      {error && <p style={{ color: '#EF4444', fontSize: 13 }}>{error}</p>}

      {/* Зв'язка статей з товарами — без AI, безкоштовно */}
      <div style={{ padding: '16px 20px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, marginBottom: 24, maxWidth: 900 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>🔗 Зв&apos;язати статті з товарами</div>
        <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 12px' }}>
          Підбирає товари за категоріями, які вже прописані в статті: цінова драбина з різних брендів,
          тільки в наявності та з ціною. Внизу статті з&apos;являється блок «Чим це зробити» обома мовами.
          Без AI — <b>безкоштовно</b>, <b>текст статті не змінюється</b>: посилання в самі абзаци не вставляються.
          <br />
          Ціни й наявність у блоці <b>живі</b> — беруться при відкритті сторінки, оновлювати нічого не треба.
          Кнопка потрібна лише коли <b>змінився асортимент</b>: додали чи прибрали товари в категорії
          й хочете, щоб стаття показувала новий набір.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={loadPlans} disabled={linking} style={{ ...btn, borderColor: '#3DBFB8', color: '#0F766E', fontWeight: 700 }}>
            Порахувати, що зміниться
          </button>
          {plans && (
            <button
              onClick={applyPlans}
              disabled={linking || !planPicked.size}
              style={{ padding: '8px 18px', background: '#3DBFB8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: linking ? 'wait' : 'pointer', opacity: linking || !planPicked.size ? 0.5 : 1 }}
            >
              {linking ? '⏳ Оновлюємо…' : `Застосувати до ${planPicked.size}`}
            </button>
          )}
          {linkMsg && <span style={{ fontSize: 13, color: linkMsg.startsWith('✓') ? '#10B981' : '#EF4444' }}>{linkMsg}</span>}
        </div>

        {plans && (() => {
          const selectable = plans.filter(p => p.picks.length);
          const allPicked = selectable.length > 0 && selectable.every(p => planPicked.has(p.id));
          return (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, color: '#475569', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={allPicked}
                onChange={() => setPlanPicked(allPicked ? new Set() : new Set(selectable.map(p => p.id)))}
                style={{ width: 15, height: 15, cursor: 'pointer' }}
              />
              {allPicked ? 'Зняти все' : `Вибрати все (${selectable.length})`}
              <span style={{ color: '#94A3B8' }}>· вибрано {planPicked.size}</span>
            </label>
          );
        })()}

        {plans && (
          <div style={{ marginTop: 8, maxHeight: 460, overflowY: 'auto', border: '1px solid #F1F5F9', borderRadius: 8 }}>
            {plans.map(p => {
              const disabled = !p.picks.length;
              return (
                <label
                  key={p.id}
                  style={{
                    display: 'flex', gap: 10, padding: '10px 12px', borderBottom: '1px solid #F1F5F9',
                    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, alignItems: 'flex-start',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={planPicked.has(p.id)}
                    disabled={disabled}
                    onChange={() => setPlanPicked(prev => {
                      const next = new Set(prev);
                      if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                      return next;
                    })}
                    style={{ marginTop: 3, width: 15, height: 15 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>
                      {p.title}
                      {p.hasBlock && <span style={{ marginLeft: 8, fontSize: 11, color: '#0EA5E9' }}>блок уже стоїть — освіжимо</span>}
                      {p.manualLinks && <span style={{ marginLeft: 8, fontSize: 11, color: '#B45309' }}>вже має власні посилання</span>}
                      {p.ruMissing && <span style={{ marginLeft: 8, fontSize: 11, color: '#EF4444' }}>немає рос. версії</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 4px' }}>
                      {p.categories.join(', ') || 'категорій не вказано'}
                      <button
                        onClick={e => {
                          e.preventDefault();
                          setEditSkus(editSkus?.id === p.id ? null : {
                            id: p.id, title: p.title,
                            items: p.current.length ? p.current : p.picks.map(({ sku, label, price, volume }) => ({ sku, label, price, volume })),
                          });
                          setSearch('');
                        }}
                        style={{ marginLeft: 10, border: 'none', background: 'none', color: '#3DBFB8', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                      >
                        {editSkus?.id === p.id ? 'згорнути' : '✏ змінити склад'}
                      </button>
                    </div>

                    {editSkus?.id === p.id ? (
                      /* Редактор: свій набір товарів статті замість автопідбору */
                      <div onClick={e => e.preventDefault()} style={{ border: '1px solid #CBD5E1', borderRadius: 8, padding: 10, background: '#F8FAFC' }}>
                        {editSkus.items.length === 0 && (
                          <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 8 }}>Товарів немає — додайте пошуком нижче</div>
                        )}
                        {editSkus.items.map((it, i) => (
                          <div key={it.sku} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
                            <span style={{ color: '#94A3B8', width: 16 }}>{i + 1}.</span>
                            <span style={{ flex: 1, color: '#1E293B' }}>
                              {it.label}
                              <span style={{ color: '#94A3B8' }}>{it.price ? ` — ${it.price} грн` : ''}</span>
                            </span>
                            <button onClick={() => moveItem(i, -1)} disabled={i === 0} style={miniBtn} title="Вище">↑</button>
                            <button onClick={() => moveItem(i, 1)} disabled={i === editSkus.items.length - 1} style={miniBtn} title="Нижче">↓</button>
                            <button
                              onClick={() => setEditSkus(s => s && ({ ...s, items: s.items.filter(x => x.sku !== it.sku) }))}
                              style={{ ...miniBtn, color: '#EF4444' }}
                              title="Прибрати"
                            >×</button>
                          </div>
                        ))}

                        <input
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          placeholder="Додати товар: назва, бренд або SKU"
                          style={{ width: '100%', marginTop: 8, padding: '7px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12 }}
                        />
                        {found.length > 0 && (
                          <div style={{ marginTop: 4, maxHeight: 160, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 6, background: '#fff' }}>
                            {found.map(f => {
                              const already = editSkus.items.some(x => x.sku === f.sku);
                              return (
                                <button
                                  key={f.sku}
                                  disabled={already}
                                  onClick={() => {
                                    setEditSkus(s => s && ({
                                      ...s,
                                      items: [...s.items, { sku: f.sku, label: `${f.brand} ${f.name}`, price: null, volume: f.volume }],
                                    }));
                                    setSearch('');
                                  }}
                                  style={{
                                    display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px',
                                    border: 'none', borderBottom: '1px solid #F1F5F9', background: 'none',
                                    fontSize: 12, color: already ? '#94A3B8' : '#1E293B', cursor: already ? 'default' : 'pointer',
                                  }}
                                >
                                  <span style={{ fontFamily: 'monospace', color: '#94A3B8' }}>{f.sku}</span> {f.name}
                                  {already && ' — уже додано'}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <button onClick={saveSkus} disabled={savingSkus}
                                  style={{ padding: '6px 14px', background: '#3DBFB8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: savingSkus ? 0.6 : 1 }}>
                            {savingSkus ? 'Зберігаю…' : 'Зберегти склад'}
                          </button>
                          <button onClick={() => { setEditSkus(null); setSearch(''); }} style={{ ...btn, fontSize: 12 }}>Скасувати</button>
                          <span style={{ fontSize: 11, color: '#94A3B8', alignSelf: 'center' }}>
                            ручний склад не перезаписується автопідбором, поки не натиснете «Застосувати»
                          </span>
                        </div>
                      </div>
                    ) : p.picks.length || p.current.length ? (
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#475569' }}>
                        {(p.current.length ? p.current : p.picks).map(x => (
                          <li key={x.sku}>
                            {x.label}
                            <span style={{ color: '#94A3B8' }}>
                              {x.volume ? ` — ${x.volume}` : ''}{x.price ? `, ${x.price} грн` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ fontSize: 12, color: '#EF4444' }}>немає товарів у наявності за категоріями статті</div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Список */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 900 }}>
        {posts.map(p => (
          <div key={p.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: p.is_published ? '#10B98118' : '#F59E0B18', color: p.is_published ? '#10B981' : '#F59E0B' }}>
              {p.is_published ? 'опубліковано' : 'чернетка'}
            </span>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{p.title}</div>
              <div style={{ fontSize: 12, color: '#64748B' }}>{p.slug} · {new Date(p.created_at).toLocaleDateString('uk-UA')}</div>
            </div>
            {p.is_published && (
              <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#1E3A5F', fontWeight: 600 }}>Відкрити →</a>
            )}
            <button onClick={() => openEditor(p.id)} style={btn}>Редагувати</button>
            <button onClick={() => togglePublish(p)} style={{ ...btn, color: p.is_published ? '#F59E0B' : '#10B981' }}>
              {p.is_published ? 'Зняти з публікації' : 'Опублікувати'}
            </button>
            <button onClick={() => remove(p)} style={{ ...btn, color: '#EF4444' }}>Видалити</button>
          </div>
        ))}
        {posts.length === 0 && <p style={{ color: '#94A3B8', fontSize: 14 }}>Статей з БД поки немає. Згенеруйте першу — введіть тему вище.</p>}
      </div>

      {/* Редактор */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => !saving && setEditing(null)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 900, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 16px' }}>Редагування: {editing.slug}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={lbl}>Заголовок (укр)
                <input style={inp} value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} />
              </label>
              <label style={lbl}>Заголовок (рос)
                <input style={inp} value={editing.title_ru ?? ''} onChange={e => setEditing({ ...editing, title_ru: e.target.value })} />
              </label>
              <label style={lbl}>Опис (укр)
                <textarea style={{ ...inp, minHeight: 60 }} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} />
              </label>
              <label style={lbl}>Опис (рос)
                <textarea style={{ ...inp, minHeight: 60 }} value={editing.description_ru ?? ''} onChange={e => setEditing({ ...editing, description_ru: e.target.value })} />
              </label>
              <label style={lbl}>Текст HTML (укр)
                <textarea style={{ ...inp, minHeight: 300, fontFamily: 'monospace', fontSize: 12 }} value={editing.content_html} onChange={e => setEditing({ ...editing, content_html: e.target.value })} />
              </label>
              <label style={lbl}>Текст HTML (рос)
                <textarea style={{ ...inp, minHeight: 300, fontFamily: 'monospace', fontSize: 12 }} value={editing.content_html_ru ?? ''} onChange={e => setEditing({ ...editing, content_html_ru: e.target.value })} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditing(null)} disabled={saving} style={btn}>Скасувати</button>
              <button onClick={() => saveEditing()} disabled={saving} style={{ ...btn, background: '#1E3A5F', color: '#fff', border: 'none' }}>Зберегти</button>
              {!editing.is_published && (
                <button onClick={() => saveEditing(true)} disabled={saving} style={{ ...btn, background: '#10B981', color: '#fff', border: 'none' }}>Зберегти й опублікувати</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: '7px 14px', background: '#fff', border: '1px solid #CBD5E1', borderRadius: 8,
  fontSize: 12, fontWeight: 600, color: '#475569', cursor: 'pointer',
};
const miniBtn: React.CSSProperties = {
  width: 22, height: 22, lineHeight: '20px', padding: 0, background: '#fff',
  border: '1px solid #CBD5E1', borderRadius: 5, fontSize: 12, color: '#475569', cursor: 'pointer',
};
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#64748B' };
const inp: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, fontFamily: 'inherit' };
