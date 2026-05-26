// Usage: node scripts/read-pdf.mjs <pdf-path>
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;

const filePath = process.argv[2];
if (!filePath) { console.error('Usage: node read-pdf.mjs <path>'); process.exit(1); }

const data = readFileSync(filePath);
const result = await pdfParse(data);
console.log(result.text);
