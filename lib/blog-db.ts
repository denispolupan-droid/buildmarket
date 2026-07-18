import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import { sanitizeArticleHtml } from './sanitize-article';

// Статті блогу з БД (нове покоління; старі статті — у lib/blog.ts + JSX).
// content_html — довірений HTML (генерується нашим AI-конвеєром, редагується
// тільки адміном) з тегами p/h2/h3/ul/ol/li/table/strong/a — рендериться
// в той самий .article-body, що й статичні статті.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export type BlogFaq = { q: string; a: string };
export type BlogRelatedLink = { label: string; href: string };

export type BlogPost = {
  id: number;
  slug: string;
  title: string;
  title_ru: string | null;
  description: string;
  description_ru: string | null;
  category: string;
  category_ru: string | null;
  read_time: number;
  keywords: string[];
  image: string | null;
  content_html: string;
  content_html_ru: string | null;
  faq: BlogFaq[];
  faq_ru: BlogFaq[];
  related_links: BlogRelatedLink[];
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

// Defense-in-depth: чистимо content_html на межі читання, тож будь-який
// рендер (через dangerouslySetInnerHTML) отримує вже безпечний HTML —
// навіть для контенту, збереженого старим (обхідним) санітайзером.
function sanitizePost(p: BlogPost): BlogPost {
  return {
    ...p,
    content_html: sanitizeArticleHtml(p.content_html),
    content_html_ru: p.content_html_ru ? sanitizeArticleHtml(p.content_html_ru) : null,
  };
}

export async function getPublishedPosts(): Promise<BlogPost[]> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('is_published', true)
    .order('published_at', { ascending: false });
  if (error) return [];
  return ((data ?? []) as BlogPost[]).map(sanitizePost);
}

export const getPublishedPostsCached = unstable_cache(
  async () => getPublishedPosts(),
  ['blog-posts'],
  { revalidate: 300, tags: ['blog'] }
);

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single();
  if (error) return null;
  return sanitizePost(data as BlogPost);
}

export const getPostBySlugCached = unstable_cache(
  async (slug: string) => getPostBySlug(slug),
  ['blog-post'],
  { revalidate: 300, tags: ['blog'] }
);
