import fs from 'fs';
import path from 'path';

const files = [
  'app/about/page.tsx',
  'app/contacts/page.tsx',
  'app/delivery/page.tsx',
  'app/dropship/page.tsx',
  'app/returns/page.tsx',
  'app/blog/page.tsx',
  'app/page.tsx',
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // Match: alternates: { canonical: 'URL' }
  // Replace with: alternates: { canonical: 'URL', languages: { 'uk': 'URL', 'ru': 'URL', 'x-default': 'URL' } }
  const updated = content.replace(
    /alternates:\s*\{\s*canonical:\s*('|`)(https:\/\/fixline\.com\.ua[^'`]*)\1\s*\}/g,
    (match, quote, url) =>
      `alternates: { canonical: ${quote}${url}${quote}, languages: { 'uk': ${quote}${url}${quote}, 'ru': ${quote}${url}${quote}, 'x-default': ${quote}${url}${quote} } }`
  );

  if (updated !== content) {
    fs.writeFileSync(file, updated, 'utf8');
    console.log('✓', file);
  } else {
    console.log('–', file, '(no match)');
  }
}
