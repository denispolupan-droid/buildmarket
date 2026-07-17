import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPostBySlugCached, getPublishedPostsCached } from '../../../../lib/blog-db';
import DbArticle, { postText } from '../../../blog/[slug]/DbArticle';

// Всі статті блогу живуть у БД (blog_posts) і керуються з /admin/blog.

const BASE = 'https://fixline.com.ua';

export const revalidate = 3600;

export async function generateStaticParams() {
  const posts = await getPublishedPostsCached();
  return posts.map(p => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlugCached(slug);
  if (!post) return { title: 'Статья не найдена', robots: { index: false } };
  const t = postText(post, 'ru');
  return {
    title: t.title,
    description: t.description,
    keywords: post.keywords,
    alternates: { canonical: `${BASE}/ru/blog/${slug}`, languages: { 'uk': `${BASE}/blog/${slug}`, 'ru': `${BASE}/ru/blog/${slug}`, 'x-default': `${BASE}/blog/${slug}` } },
    openGraph: {
      title: t.title,
      description: t.description,
      url: `${BASE}/ru/blog/${slug}`,
      siteName: 'FIXLINE',
      locale: 'ru_RU',
      type: 'article',
      publishedTime: post.published_at ?? undefined,
      ...(post.image ? { images: [{ url: `${BASE}${post.image}`, width: 1200, height: 630, alt: t.title }] } : {}),
    },
  };
}

export default async function RuBlogArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostBySlugCached(slug);
  if (!post) notFound();
  return <DbArticle post={post} lang="ru" />;
}
