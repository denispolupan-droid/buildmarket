import { getPublishedPostsCached } from '../../../lib/blog-db';
import { SITE_URL } from '../../../lib/site';

/**
 * RSS блогу — для агрегаторів, читалок і ШІ-краулерів, які тягнуть свіже
 * через фіди, а не обходом. Українська версія; посилання на статті канонічні.
 */
export const revalidate = 3600;

function x(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function GET() {
  const posts = (await getPublishedPostsCached())
    .filter(p => p.published_at)
    .sort((a, b) => (b.published_at! > a.published_at! ? 1 : -1))
    .slice(0, 50);
  const lastBuild = posts[0]?.updated_at ?? new Date().toISOString();
  const items = posts.map(p => `    <item>
      <title>${x(p.title)}</title>
      <link>${SITE_URL}/blog/${p.slug}</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${p.slug}</guid>
      <pubDate>${new Date(p.published_at!).toUTCString()}</pubDate>
      <description>${x(p.description)}</description>${p.image ? `
      <enclosure url="${SITE_URL}${p.image}" type="image/webp" />` : ''}
    </item>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>FIXLINE — поради щодо будівельної хімії</title>
    <link>${SITE_URL}/blog</link>
    <atom:link href="${SITE_URL}/blog/feed.xml" rel="self" type="application/rss+xml" />
    <description>Практичні статті про герметики, монтажну піну, клеї, ґрунтовки та фарби: як вибрати, як використовувати, скільки потрібно.</description>
    <language>uk</language>
    <lastBuildDate>${new Date(lastBuild).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
