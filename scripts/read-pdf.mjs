// Usage: node scripts/read-pdf.mjs <pdf-path>
import { readFileSync } from 'fs';

const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

const filePath = process.argv[2];
if (!filePath) { console.error('Usage: node read-pdf.mjs <path>'); process.exit(1); }

const buf  = readFileSync(filePath);
const doc  = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;

let text = '';
for (let i = 1; i <= doc.numPages; i++) {
  const page    = await doc.getPage(i);
  const content = await page.getTextContent();
  text += content.items.map(it => it.str).join(' ') + '\n';
}

console.log(text);
