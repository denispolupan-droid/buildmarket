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
  /** Обкладинка з російським заголовком (у зображення вшито текст); null → фолбек на image */
  image_ru: string | null;
  content_html: string;
  content_html_ru: string | null;
  faq: BlogFaq[];
  faq_ru: BlogFaq[];
  related_links: BlogRelatedLink[];
  /** Артикули товарів для блоку «Чим це зробити» — ціни беруться на рендері */
  product_skus: string[];
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

/**
 * Стаття, у блоці «Чим це зробити» якої стоїть саме цей товар.
 *
 * У картці товару стаття досі бралася лише з категорії, тобто одна на всю
 * категорію: для «акрилових герметиків» це і віконний шов, і плінтус, і
 * кольоровий по дереву — стаття підійде хіба що загальна. А звʼязок «стаття
 * ↔ конкретний товар» у базі вже є (blog_posts.product_skus) і нею користується
 * блок товарів у статті. Тут читаємо його у зворотний бік.
 *
 * Якщо товар потрапив у кілька статей, беремо найсвіжішу опубліковану: свіжа
 * стаття зазвичай і точніша.
 */
export async function getPostSlugForSku(sku: string): Promise<string | null> {
  if (!sku) return null;
  const { data, error } = await supabase
    .from('blog_posts')
    .select('slug')
    .eq('is_published', true)
    .contains('product_skus', [sku])
    .order('published_at', { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  return (data[0] as { slug: string }).slug;
}

export const getPostSlugForSkuCached = unstable_cache(
  async (sku: string) => getPostSlugForSku(sku),
  ['blog-post-for-sku'],
  { revalidate: 300, tags: ['blog'] }
);
