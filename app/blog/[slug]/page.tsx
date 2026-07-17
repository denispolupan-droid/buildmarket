import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPostBySlugCached, getPublishedPostsCached } from '../../../lib/blog-db';
import DbArticle from './DbArticle';

// Всі статті блогу живуть у БД (blog_posts) і керуються з /admin/blog.
// Статичні JSX-статті мігровано в БД 2026-07-18.

const BASE = 'https://fixline.com.ua';

export const revalidate = 3600;

export async function generateStaticParams() {
  const posts = await getPublishedPostsCached();
  return posts.map(p => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlugCached(slug);
  if (!post) return { title: 'Статтю не знайдено', robots: { index: false } };
  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: `${BASE}/blog/${slug}`, languages: { 'uk': `${BASE}/blog/${slug}`, 'ru': `${BASE}/ru/blog/${slug}`, 'x-default': `${BASE}/blog/${slug}` } },
    openGraph: {
      title: post.title,
      description: post.description,
      url: `${BASE}/blog/${slug}`,
      siteName: 'FIXLINE',
      locale: 'uk_UA',
      type: 'article',
      publishedTime: post.published_at ?? undefined,
      ...(post.image ? { images: [{ url: `${BASE}${post.image}`, width: 1200, height: 630, alt: post.title }] } : {}),
    },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostBySlugCached(slug);
  if (!post) notFound();
  return <DbArticle post={post} lang="uk" />;
}
