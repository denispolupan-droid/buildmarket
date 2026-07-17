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
      </div>
      {error && <p style={{ color: '#EF4444', fontSize: 13 }}>{error}</p>}

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
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#64748B' };
const inp: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, fontFamily: 'inherit' };
