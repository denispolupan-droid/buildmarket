// Usage: node scripts/read-pdf.cjs <pdf-path>
const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];
if (!filePath) { console.error('Usage: node read-pdf.cjs <path>'); process.exit(1); }

async function run() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjs.getDocument({ data }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n';
  }
  console.log(text);
}

run().catch(e => { console.error(e.message); process.exit(1); });
