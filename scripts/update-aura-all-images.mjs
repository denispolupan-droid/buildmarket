/**
 * update-aura-all-images.mjs
 *
 * Phase 1 — Refresh all 95 known AURA SKUs with processed images + update DB
 * Phase 2 — Upload ALL images from every 3D_Моделі folder to aura/catalog/
 *            (for products not yet in DB — ready for future use)
 *
 * Processing: trim white/transparent → 6% padding → 1200×1200 PNG
 *
 * Usage: node scripts/update-aura-all-images.mjs
 */

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY  = env['SUPABASE_SERVICE_ROLE_KEY'];
const BUCKET       = 'products';
const BASE_DIR     = 'K:/Users/polupan.denis/Downloads/AURA-20260525T194603Z-3-001/AURA';
const OUT_SIZE     = 1200;
const PAD_PCT      = 0.06; // 6% padding each side

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─────────────────────────────────────────────────────────────
// PHASE 1 — Known SKU → source image mapping (95 DB products)
// ─────────────────────────────────────────────────────────────
const D = BASE_DIR;

const SKU_IMAGES = {
  // ── Fix PVA ──────────────────────────────────────────────
  '1604-021': `${D}/WEB_Pasport_Aura_Fix_PVA_ukr/3D_Моделі/WEB/1080x1080_AURA_Fix_PVA_1L_F.png`,
  '1604-022': `${D}/WEB_Pasport_Aura_Fix_PVA_ukr/3D_Моделі/WEB/1080x1080_AURA_Fix_PVA_1L_F.png`,
  '1604-023': `${D}/WEB_Pasport_Aura_Fix_PVA_ukr/3D_Моделі/WEB/1080x1080_AURA_Fix_PVA_3L_F.png`,
  '1604-024': `${D}/WEB_Pasport_Aura_Fix_PVA_ukr/3D_Моделі/WEB/1080x1080_AURA_Fix_PVA_5L_F.png`,
  '1604-025': `${D}/WEB_Pasport_Aura_Fix_PVA_ukr/3D_Моделі/WEB/1080x1080_AURA_Fix_PVA_5L_F.png`,

  // ── AquaGrund (use 1L for 0.5L — better quality) ─────────
  '1204-013': `${D}/WEB_Pasport_Aura_Koncentrat_Aquagrund_ukr/3D_Моделі/AURA Koncentrat AquaGrund 1L_1.png`,
  '1204-014': `${D}/WEB_Pasport_Aura_Koncentrat_Aquagrund_ukr/3D_Моделі/AURA Koncentrat AquaGrund 1L_1.png`,
  '1204-015': `${D}/WEB_Pasport_Aura_Koncentrat_Aquagrund_ukr/3D_Моделі/AURA Koncentrat AquaGrund 3L.png`,
  '1204-016': `${D}/WEB_Pasport_Aura_Koncentrat_Aquagrund_ukr/3D_Моделі/AURA Koncentrat AquaGrund 10L.png`,

  // ── GammaGrund (use 1L for 0.5L — better quality) ────────
  '1204-017': `${D}/WEB_Pasport_Aura_Koncentrat_GammaGrund_ukr/3D_Моделі/AURA Koncentrat GammaGrund 1L_1.png`,
  '1204-018': `${D}/WEB_Pasport_Aura_Koncentrat_GammaGrund_ukr/3D_Моделі/AURA Koncentrat GammaGrund 1L_1.png`,
  '1204-019': `${D}/WEB_Pasport_Aura_Koncentrat_GammaGrund_ukr/3D_Моделі/AURA Koncentrat GammaGrund 3L.png`,
  '1204-020': `${D}/WEB_Pasport_Aura_Koncentrat_GammaGrund_ukr/3D_Моделі/AURA Koncentrat GammaGrund 10L.png`,

  // ── Unigrund BioBlock ─────────────────────────────────────
  '1203-030': `${D}/WEB_Pasport_Aura_Unigrund_BioBlock_ukr/3D_Моделі/AURA Unigrund BioBlock 1L-1.png`,
  '1203-031': `${D}/WEB_Pasport_Aura_Unigrund_BioBlock_ukr/3D_Моделі/AURA Unigrund BioBlock 5L.png`,

  // ── Beton Kontakt ─────────────────────────────────────────
  '2100-022': `${D}/WEB_Pasport_Aura_Beton_Kontakt_ukr/3D_Моделі/AURA Beton Kontakt 5L-1.png`,
  '2100-023': `${D}/WEB_Pasport_Aura_Beton_Kontakt_ukr/3D_Моделі/AURA Beton Kontakt 5L-1.png`,
  '2100-024': `${D}/WEB_Pasport_Aura_Beton_Kontakt_ukr/3D_Моделі/AURA Beton Kontakt 14KG-1.png`,
  '2100-025': `${D}/WEB_Pasport_Aura_Beton_Kontakt_ukr/3D_Моделі/AURA Beton Kontakt 14KG-1.png`,

  // ── Lasur Aqua ────────────────────────────────────────────
  '1402-001': `${D}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 0,75L-1.png`,
  '1402-002': `${D}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 2,5L-1.png`,
  '1402-003': `${D}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 0,75L-1.png`,
  '1402-004': `${D}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 2,5L-1.png`,
  '1402-005': `${D}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 0,75L-1.png`,
  '1402-006': `${D}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 2,5L-1.png`,
  '1402-007': `${D}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 0,75L-1.png`,
  '1402-008': `${D}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 2,5L-1.png`,
  '1402-009': `${D}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 0,75L-1.png`,
  '1402-010': `${D}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 2,5L-1.png`,
  '1402-011': `${D}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 0,75L-1.png`,
  '1402-012': `${D}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 2,5L-1.png`,
  '1402-013': `${D}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 0,75L-1.png`,
  '1402-014': `${D}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 2,5L-1.png`,
  '1402-015': `${D}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 0,75L-1.png`,
  '1402-016': `${D}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 2,5L-1.png`,
  '1402-017': `${D}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 0,75L-1.png`,
  '1402-018': `${D}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 2,5L-1.png`,

  // ── Fasad ─────────────────────────────────────────────────
  '2108-011': `${D}/WEB_Pasport_Aura_Fasad_ukr/3D_Моделі/AURA Fasad 1L.png`,
  '2108-012': `${D}/WEB_Pasport_Aura_Fasad_ukr/3D_Моделі/AURA Fasad 3,5L.png`,
  '2108-013': `${D}/WEB_Pasport_Aura_Fasad_ukr/3D_Моделі/AURA Fasad 7L.png`,
  '2108-014': `${D}/WEB_Pasport_Aura_Fasad_ukr/3D_Моделі/AURA Fasad 14KG-1.png`,

  // ── Fasad Expo ────────────────────────────────────────────
  '2108-015': `${D}/WEB_Pasport_Aura_Fasad_Expo_ukr/3D_Моделі/AURA Fasad Expo 10L-1.png`,
  '2108-016': `${D}/WEB_Pasport_Aura_Fasad_Expo_ukr/3D_Моделі/AURA Fasad Expo 10L-1.png`,
  '2108-017': `${D}/WEB_Pasport_Aura_Fasad_Expo_ukr/3D_Моделі/AURA Fasad Expo 10L-1.png`,
  '2108-018': `${D}/WEB_Pasport_Aura_Fasad_Expo_ukr/3D_Моделі/AURA Fasad Expo 10L-1.png`,

  // ── Fasad Fort ────────────────────────────────────────────
  '2108-019': `${D}/WEB_Pasport_Aura_Fasad_Fort_ukr/3D_Моделі/AURA Fasad Fort 10L_Інтернет.png`,
  '2108-020': `${D}/WEB_Pasport_Aura_Fasad_Fort_ukr/3D_Моделі/AURA Fasad Fort 10L_Інтернет.png`,
  '2108-021': `${D}/WEB_Pasport_Aura_Fasad_Fort_ukr/3D_Моделі/AURA Fasad Fort 10L_Інтернет.png`,
  '2108-022': `${D}/WEB_Pasport_Aura_Fasad_Fort_ukr/3D_Моделі/AURA Fasad Fort 10L_Інтернет.png`,

  // ── Lux Pro 3 ─────────────────────────────────────────────
  '2109-008': `${D}/WEB_Pasport_Aura_Luxpro_3_ukr/3D_Моделі/AURA Luxpro 3 1L-1.png`,
  '2109-009': `${D}/WEB_Pasport_Aura_Luxpro_3_ukr/3D_Моделі/AURA Luxpro 3 2.85L-1.png`,
  '2109-010': `${D}/WEB_Pasport_Aura_Luxpro_3_ukr/3D_Моделі/AURA Luxpro 3 4.75L-1.png`,
  '2109-011': `${D}/WEB_Pasport_Aura_Luxpro_3_ukr/3D_Моделі/AURA Luxpro 3 9.5L-1.png`,

  // ── Luxpro 1 ──────────────────────────────────────────────
  '2109-012': `${D}/WEB_Pasport_Aura_Luxpro_1_ukr/3D_Моделі/AURA Luxpro 1 1L-1.png`,
  '2109-013': `${D}/WEB_Pasport_Aura_Luxpro_1_ukr/3D_Моделі/AURA Luxpro 1 2.85L-1.png`,
  '2109-014': `${D}/WEB_Pasport_Aura_Luxpro_1_ukr/3D_Моделі/AURA Luxpro 1 4.75L-1.png`,
  '2109-015': `${D}/WEB_Pasport_Aura_Luxpro_1_ukr/3D_Моделі/AURA Luxpro 1 9.5L-1.png`,

  // ── Luxpro 7 ──────────────────────────────────────────────
  '2109-016': `${D}/WEB_Pasport_Aura_Luxpro_7_ukr/3D_Моделі/AURA Luxpro 7 1L-1.png`,
  '2109-017': `${D}/WEB_Pasport_Aura_Luxpro_7_ukr/3D_Моделі/AURA Luxpro 7 2.85L-1.png`,
  '2109-018': `${D}/WEB_Pasport_Aura_Luxpro_7_ukr/3D_Моделі/AURA Luxpro 7 4.75L-1.png`,
  '2109-019': `${D}/WEB_Pasport_Aura_Luxpro_7_ukr/3D_Моделі/AURA Luxpro 7 9.5L-1.png`,

  // ── Luxpro 10 ─────────────────────────────────────────────
  '2109-020': `${D}/WEB_Pasport_Aura_Luxpro_10_ukr/3D_Моделі/AURA Luxpro 10 1L-1.png`,
  '2109-021': `${D}/WEB_Pasport_Aura_Luxpro_10_ukr/3D_Моделі/AURA Luxpro 10 2.85L-1.png`,
  '2109-022': `${D}/WEB_Pasport_Aura_Luxpro_10_ukr/3D_Моделі/AURA Luxpro 10 4.75L-1.png`,
  '2109-023': `${D}/WEB_Pasport_Aura_Luxpro_10_ukr/3D_Моделі/AURA Luxpro 10 9.5L-1.png`,

  // ── Luxpro Thermo ─────────────────────────────────────────
  '2109-024': `${D}/WEB_Pasport_Aura_Luxpro_Thermo_ukr/3D_Моделі/AURA Luxpro Thermo 0,75L-1.png`,
  '2109-025': `${D}/WEB_Pasport_Aura_Luxpro_Thermo_ukr/3D_Моделі/AURA Luxpro Thermo 0,75L-1.png`,
  '2109-026': `${D}/WEB_Pasport_Aura_Luxpro_Thermo_ukr/3D_Моделі/AURA Luxpro Thermo 2,2L-1.png`,

  // ── Luxpro Thermo Matt ────────────────────────────────────
  '2109-027': `${D}/WEB_Pasport_Aura_Luxpro_Thermo_Matt_ukr/3D_Моделі/AURA Luxpro Thermo Matt 0,75L-1.png`,
  '2109-028': `${D}/WEB_Pasport_Aura_Luxpro_Thermo_Matt_ukr/3D_Моделі/AURA Luxpro Thermo Matt 0,75L-1.png`,
  '2109-029': `${D}/WEB_Pasport_Aura_Luxpro_Thermo_Matt_ukr/3D_Моделі/AURA Luxpro Thermo Matt 2,2L-1.png`,

  // ── Malare ────────────────────────────────────────────────
  '2109-030': `${D}/WEB_Pasport_Aura_Malare_ukr/3D_Моделі/AURA Malare 0.9L-1.png`,
  '2109-031': `${D}/WEB_Pasport_Aura_Malare_ukr/3D_Моделі/AURA Malare 3L-1.png`,
  '2109-032': `${D}/WEB_Pasport_Aura_Malare_ukr/3D_Моделі/AURA Malare 5L-1.png`,
  '2109-033': `${D}/WEB_Pasport_Aura_Malare_ukr/3D_Моделі/AURA Malare 10L-1.png`,

  // ── Mattlatex ─────────────────────────────────────────────
  '2109-034': `${D}/WEB_Pasport_Aura_Mattlatex_ukr/3D_Моделі/AURA Mattlatex 0.9L-2.png`,
  '2109-035': `${D}/WEB_Pasport_Aura_Mattlatex_ukr/3D_Моделі/AURA Mattlatex 3L-1.png`,
  '2109-036': `${D}/WEB_Pasport_Aura_Mattlatex_ukr/3D_Моделі/AURA Mattlatex 5L-1.png`,
  '2109-037': `${D}/WEB_Pasport_Aura_Mattlatex_ukr/3D_Моделі/AURA Mattlatex 10L-1.png`,

  // ── Neolatex ──────────────────────────────────────────────
  '2109-038': `${D}/WEB_Pasport_Aura_Neolatex_ukr/3D_Моделі/AURA Neolatex 0.9L-1.png`,
  '2109-039': `${D}/WEB_Pasport_Aura_Neolatex_ukr/3D_Моделі/AURA Neolatex 3L-1.png`,
  '2109-040': `${D}/WEB_Pasport_Aura_Neolatex_ukr/3D_Моделі/AURA Neolatex 5L-1.png`,
  '2109-041': `${D}/WEB_Pasport_Aura_Neolatex_ukr/3D_Моделі/AURA Neolatex 10L-1.png`,

  // ── Aqua Lack 20 ──────────────────────────────────────────
  '2105-023': `${D}/WEB_Pasport_Aura_Aqua_Lakk_20_ukr/3D_Моделі/AURA Aqua Lack 20 1L-1.png`,
  '2105-024': `${D}/WEB_Pasport_Aura_Aqua_Lakk_20_ukr/3D_Моделі/AURA Aqua Lack 20 2,5L-1.png`,
  '2105-025': `${D}/WEB_Pasport_Aura_Aqua_Lakk_20_ukr/3D_Моделі/AURA Aqua Lack 20 10L-1.png`,

  // ── Aqua Lack 70 ──────────────────────────────────────────
  '2105-026': `${D}/WEB_Pasport_Aura_Aqua_Lakk_70_ukr/3D_Моделі/AURA Aqua Lack 70 1L-1.png`,
  '2105-027': `${D}/WEB_Pasport_Aura_Aqua_Lakk_70_ukr/3D_Моделі/AURA Aqua Lack 70 2,5L-1.png`,
  '2105-028': `${D}/WEB_Pasport_Aura_Aqua_Lakk_70_ukr/3D_Моделі/AURA Aqua Lack 70 10L-1.png`,

  // ── Dekor Lack ────────────────────────────────────────────
  '2105-029': `${D}/WEB_Pasport_Aura_Dekor_Lack_ukr/3D_Моделі/AURA Dekor Lack 0,75L-1.png`,
  '2105-030': `${D}/WEB_Pasport_Aura_Dekor_Lack_ukr/3D_Моделі/AURA Dekor Lack 2,5L-1.png`,
  '2105-031': `${D}/WEB_Pasport_Aura_Dekor_Lack_ukr/3D_Моделі/AURA Dekor Lack 10L-1.png`,

  // ── Dekor Lack Matt ───────────────────────────────────────
  '2105-032': `${D}/WEB_Pasport_Aura_Dekor_Lack_Matt_ukr/3D_Моделі/Aura Dekor Lack Matt 0,75L - 1.png`,
  '2105-033': `${D}/WEB_Pasport_Aura_Dekor_Lack_Matt_ukr/3D_Моделі/Aura Dekor Lack Matt 2,5L - 1.png`,
  '2105-034': `${D}/WEB_Pasport_Aura_Dekor_Lack_Matt_ukr/3D_Моделі/Aura Dekor Lack Matt 10L - 1.png`,
};

// ─────────────────────────────────────────────────────────────
// Image processing pipeline
// ─────────────────────────────────────────────────────────────
async function processImage(srcPath) {
  if (!fs.existsSync(srcPath)) {
    console.warn(`    ⚠ File not found: ${path.basename(srcPath)}`);
    return null;
  }

  try {
    // Step 1: Flatten alpha over white + trim
    const trimBuf = await sharp(srcPath)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .trim({ threshold: 20 })
      .png()
      .toBuffer();

    const trimMeta = await sharp(trimBuf).metadata();
    const padding = Math.round(Math.max(trimMeta.width, trimMeta.height) * PAD_PCT);

    // Step 2: Add padding (materialize buffer first — chaining .extend().resize()
    //          in one pipeline produces wrong output dimensions at 72 DPI)
    const extBuf = await sharp(trimBuf)
      .extend({
        top: padding, bottom: padding, left: padding, right: padding,
        background: { r: 255, g: 255, b: 255 },
      })
      .toBuffer();

    // Step 3: Resize to 1200×1200 in a fresh sharp instance
    const processed = await sharp(extBuf)
      .resize(OUT_SIZE, OUT_SIZE, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255 },
      })
      .png({ compressionLevel: 8 })
      .toBuffer();

    return { buffer: processed, trimW: trimMeta.width, trimH: trimMeta.height, padding };
  } catch (err) {
    console.error(`    ✗ Processing error: ${err.message}`);
    return null;
  }
}

async function uploadToStorage(buffer, storagePath) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: 'image/png', upsert: true });
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Convert a raw filename to a safe catalog key, e.g.
 *  "AURA Luxpro Helmatt 1L-1" → "luxpro-helmatt-1l"
 *  "1080x1080_AURA_Fix_PVA_1L_F" → "fix-pva-1l-f"
 */
function toCatalogKey(basename) {
  return basename
    .replace(/\.(png|jpg|jpeg)$/i, '')
    .replace(/^(AURA|Aura|aura)\s+/i, '')       // remove leading "AURA "
    .replace(/^(Aura_|AURA_)/i, '')              // remove "AURA_" prefix
    .replace(/1080x1080_/gi, '')
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/,/g, '')
    .replace(/[^a-zA-Z0-9\-Ѐ-ӿ]/g, '') // keep latin + cyrillic + dash
    .replace(/-{2,}/g, '-')
    .replace(/-(1|2|F|P)$/i, '')                 // strip trailing -1, -2, -F, -P
    .replace(/-$/g, '')
    .toLowerCase();
}

/** Pick the best image from a list of PNG paths:
 *  1) Prefer *-1.png (front view)
 *  2) Prefer *_Front* or *_Інтернет* or *_Web*
 *  3) Skip ads/perspective: *рекла*, *-2.png*, ESKARO, *Light*
 *  4) Fall back to first .png
 */
function pickBestImage(pngs) {
  const clean = pngs.filter(p => {
    const b = path.basename(p).toLowerCase();
    return !b.includes('eskaro') && !b.includes('рекла') && !b.includes('_light');
  });

  // Prefer -1.png
  const front1 = clean.filter(p => /[\-_]1\.(png)$/i.test(p));
  if (front1.length > 0) return front1[0];

  // Prefer internet/front/web named
  const webNamed = clean.filter(p => {
    const b = path.basename(p).toLowerCase();
    return b.includes('інтернет') || b.includes('front') || b.includes('web') || b.includes('_1.');
  });
  if (webNamed.length > 0) return webNamed[0];

  // Skip -2.png
  const notPersp = clean.filter(p => !/[\-_]2\.(png)$/i.test(p));
  if (notPersp.length > 0) return notPersp[0];

  return clean[0] ?? pngs[0];
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
async function main() {
  let phase1Ok = 0, phase1Fail = 0;
  let phase2Ok = 0, phase2Skip = 0;

  // ── PHASE 1: Known SKUs ─────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  PHASE 1 — Refreshing ${Object.keys(SKU_IMAGES).length} known AURA SKUs`);
  console.log(`${'═'.repeat(60)}\n`);

  const dbUpdates = [];

  for (const [sku, srcPath] of Object.entries(SKU_IMAGES)) {
    process.stdout.write(`  ${sku}  ${path.basename(srcPath)} ... `);
    const result = await processImage(srcPath);
    if (!result) { phase1Fail++; continue; }

    try {
      await uploadToStorage(result.buffer, `aura/${sku}.png`);
      const kb = Math.round(result.buffer.length / 1024);
      console.log(`✓  [${result.trimW}×${result.trimH} +pad${result.padding}] → ${kb}KB`);
      dbUpdates.push({ sku, imagePath: `/img/products/aura/${sku}.png` });
      phase1Ok++;
    } catch (err) {
      console.error(`✗ Upload: ${err.message}`);
      phase1Fail++;
    }
  }

  // Batch-update DB
  console.log(`\n  Updating ${dbUpdates.length} products in DB...`);
  for (const { sku, imagePath } of dbUpdates) {
    const { error } = await supabase
      .from('products')
      .update({ image: imagePath })
      .eq('sku', sku);
    if (error) console.error(`  ✗ DB ${sku}: ${error.message}`);
  }
  console.log(`  ✓ DB update done\n`);

  // ── PHASE 2: Catalog for ALL AURA product lines ─────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  PHASE 2 — Uploading catalog images for ALL AURA products`);
  console.log(`${'═'.repeat(60)}\n`);

  const catalogReport = [];

  const productFolders = fs.readdirSync(BASE_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const folderName of productFolders) {
    const modelsDir = path.join(BASE_DIR, folderName, '3D_Моделі');
    if (!fs.existsSync(modelsDir)) continue;

    // Collect all PNGs (excluding sub-folders like /WEB/ — handle separately)
    const allPngs = [];

    const collectPngs = (dir, recursive = false) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory() && recursive) {
          collectPngs(path.join(dir, e.name), false);
        } else if (e.isFile() && e.name.toLowerCase().endsWith('.png')) {
          allPngs.push(path.join(dir, e.name));
        }
      }
    };
    collectPngs(modelsDir, true);

    if (allPngs.length === 0) continue;

    // Group images by "size/variant" — each unique -1.png is a distinct variant
    // Pick front-view images only (skip -2 perspective, ads, ESKARO)
    const frontImages = allPngs.filter(p => {
      const b = path.basename(p).toLowerCase();
      return !b.includes('-2.png') && !b.includes('eskaro') &&
             !b.includes('рекла') && !b.includes('_light') &&
             !b.includes('perspt') && !b.includes('perspective');
    });

    const toUpload = frontImages.length > 0 ? frontImages : [pickBestImage(allPngs)].filter(Boolean);

    for (const srcPath of toUpload) {
      const basename = path.basename(srcPath, '.png');
      const catalogKey = toCatalogKey(basename);
      if (!catalogKey) continue;

      const storagePath = `aura/catalog/${catalogKey}.png`;
      const dbImagePath = `/img/products/aura/catalog/${catalogKey}.png`;

      process.stdout.write(`  ${catalogKey}.png ... `);
      const result = await processImage(srcPath);
      if (!result) { phase2Skip++; continue; }

      try {
        await uploadToStorage(result.buffer, storagePath);
        const kb = Math.round(result.buffer.length / 1024);
        console.log(`✓  ${kb}KB`);
        catalogReport.push({ folder: folderName, file: path.basename(srcPath), dbPath: dbImagePath });
        phase2Ok++;
      } catch (err) {
        console.error(`✗ ${err.message}`);
        phase2Skip++;
      }
    }
  }

  // ── Summary ─────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  SUMMARY');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Phase 1 (DB products): ${phase1Ok} ✓  ${phase1Fail} ✗`);
  console.log(`  Phase 2 (catalog):     ${phase2Ok} ✓  ${phase2Skip} skipped`);
  console.log(`\n  Catalog images are at: /img/products/aura/catalog/<key>.png`);
  console.log(`  Use these paths in the DB when adding new AURA products.\n`);

  // Print catalog reference table
  if (catalogReport.length > 0) {
    console.log('  Catalog reference:');
    for (const { folder, file, dbPath } of catalogReport) {
      const short = folder.replace('WEB_Pasport_', '').replace('_ukr', '').replace('_укр', '');
      console.log(`    ${short.padEnd(45)} → ${dbPath}`);
    }
  }

  console.log('\n  Done!\n');
}

main().catch(console.error);
