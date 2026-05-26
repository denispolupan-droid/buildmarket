/**
 * Process AURA product images:
 *  1. Trim excess white/transparent background
 *  2. Add 5% uniform padding
 *  3. Export as 1200x1200 high-quality PNG
 *  4. Upload to Supabase Storage (upsert)
 *
 * Usage: node scripts/process-aura-images.mjs
 */
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'fs';
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY  = env['SUPABASE_SERVICE_ROLE_KEY'];
const BUCKET       = 'products';
const BASE_DIR     = 'K:/Users/polupan.denis/Downloads/AURA-20260525T194603Z-3-001/AURA';
const OUT_SIZE     = 1200; // output px
const PAD_PCT      = 0.06; // 6% padding each side

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// SKU → best source image
// NOTE: for AquaGrund/GammaGrund 0.5L we switch to the 1L image (much better quality)
const SKU_IMAGES = {
  // ── Fix PVA ──────────────────────────────────────────────────────────────
  '1604-021': `${BASE_DIR}/WEB_Pasport_Aura_Fix_PVA_ukr/3D_Моделі/WEB/1080x1080_AURA_Fix_PVA_1L_F.png`,
  '1604-022': `${BASE_DIR}/WEB_Pasport_Aura_Fix_PVA_ukr/3D_Моделі/WEB/1080x1080_AURA_Fix_PVA_1L_F.png`,
  '1604-023': `${BASE_DIR}/WEB_Pasport_Aura_Fix_PVA_ukr/3D_Моделі/WEB/1080x1080_AURA_Fix_PVA_3L_F.png`,
  '1604-024': `${BASE_DIR}/WEB_Pasport_Aura_Fix_PVA_ukr/3D_Моделі/WEB/1080x1080_AURA_Fix_PVA_5L_F.png`,
  '1604-025': `${BASE_DIR}/WEB_Pasport_Aura_Fix_PVA_ukr/3D_Моделі/WEB/1080x1080_AURA_Fix_PVA_5L_F.png`,

  // ── AquaGrund — use 1L for 0.5L (212x609 → 1184x3703) ───────────────────
  '1204-013': `${BASE_DIR}/WEB_Pasport_Aura_Koncentrat_Aquagrund_ukr/3D_Моделі/AURA Koncentrat AquaGrund 1L_1.png`,
  '1204-014': `${BASE_DIR}/WEB_Pasport_Aura_Koncentrat_Aquagrund_ukr/3D_Моделі/AURA Koncentrat AquaGrund 1L_1.png`,
  '1204-015': `${BASE_DIR}/WEB_Pasport_Aura_Koncentrat_Aquagrund_ukr/3D_Моделі/AURA Koncentrat AquaGrund 3L.png`,
  '1204-016': `${BASE_DIR}/WEB_Pasport_Aura_Koncentrat_Aquagrund_ukr/3D_Моделі/AURA Koncentrat AquaGrund 10L.png`,

  // ── GammaGrund — use 1L for 0.5L (212x609 → 1184x3703) ──────────────────
  '1204-017': `${BASE_DIR}/WEB_Pasport_Aura_Koncentrat_GammaGrund_ukr/3D_Моделі/AURA Koncentrat GammaGrund 1L_1.png`,
  '1204-018': `${BASE_DIR}/WEB_Pasport_Aura_Koncentrat_GammaGrund_ukr/3D_Моделі/AURA Koncentrat GammaGrund 1L_1.png`,
  '1204-019': `${BASE_DIR}/WEB_Pasport_Aura_Koncentrat_GammaGrund_ukr/3D_Моделі/AURA Koncentrat GammaGrund 3L.png`,
  '1204-020': `${BASE_DIR}/WEB_Pasport_Aura_Koncentrat_GammaGrund_ukr/3D_Моделі/AURA Koncentrat GammaGrund 10L.png`,

  // ── Unigrund BioBlock ─────────────────────────────────────────────────────
  '1203-030': `${BASE_DIR}/WEB_Pasport_Aura_Unigrund_BioBlock_ukr/3D_Моделі/AURA Unigrund BioBlock 1L-1.png`,
  '1203-031': `${BASE_DIR}/WEB_Pasport_Aura_Unigrund_BioBlock_ukr/3D_Моделі/AURA Unigrund BioBlock 5L.png`,

  // ── Beton Kontakt (4742x4742 — already great quality) ────────────────────
  '2100-022': `${BASE_DIR}/WEB_Pasport_Aura_Beton_Kontakt_ukr/3D_Моделі/AURA Beton Kontakt 5L-1.png`,
  '2100-023': `${BASE_DIR}/WEB_Pasport_Aura_Beton_Kontakt_ukr/3D_Моделі/AURA Beton Kontakt 5L-1.png`,
  '2100-024': `${BASE_DIR}/WEB_Pasport_Aura_Beton_Kontakt_ukr/3D_Моделі/AURA Beton Kontakt 14KG-1.png`,
  '2100-025': `${BASE_DIR}/WEB_Pasport_Aura_Beton_Kontakt_ukr/3D_Моделі/AURA Beton Kontakt 14KG-1.png`,

  // ── Lasur Aqua ────────────────────────────────────────────────────────────
  '1402-001': `${BASE_DIR}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 0,75L-1.png`,
  '1402-002': `${BASE_DIR}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 2,5L-1.png`,
  '1402-003': `${BASE_DIR}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 0,75L-1.png`,
  '1402-004': `${BASE_DIR}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 2,5L-1.png`,
  '1402-005': `${BASE_DIR}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 0,75L-1.png`,
  '1402-006': `${BASE_DIR}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 2,5L-1.png`,
  '1402-007': `${BASE_DIR}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 0,75L-1.png`,
  '1402-008': `${BASE_DIR}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 2,5L-1.png`,
  '1402-009': `${BASE_DIR}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 0,75L-1.png`,
  '1402-010': `${BASE_DIR}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 2,5L-1.png`,
  '1402-011': `${BASE_DIR}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 0,75L-1.png`,
  '1402-012': `${BASE_DIR}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 2,5L-1.png`,
  '1402-013': `${BASE_DIR}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 0,75L-1.png`,
  '1402-014': `${BASE_DIR}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 2,5L-1.png`,
  '1402-015': `${BASE_DIR}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 0,75L-1.png`,
  '1402-016': `${BASE_DIR}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 2,5L-1.png`,
  '1402-017': `${BASE_DIR}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 0,75L-1.png`,
  '1402-018': `${BASE_DIR}/WEB_Pasport_Aura_Lasur_Aqua_ukr/3D_Моделі/AURA Lasur Aqua 2,5L-1.png`,

  // ── Fasad (4742x4742 — great quality) ────────────────────────────────────
  '2108-011': `${BASE_DIR}/WEB_Pasport_Aura_Fasad_ukr/3D_Моделі/AURA Fasad 1L.png`,
  '2108-012': `${BASE_DIR}/WEB_Pasport_Aura_Fasad_ukr/3D_Моделі/AURA Fasad 3,5L.png`,
  '2108-013': `${BASE_DIR}/WEB_Pasport_Aura_Fasad_ukr/3D_Моделі/AURA Fasad 7L.png`,
  '2108-014': `${BASE_DIR}/WEB_Pasport_Aura_Fasad_ukr/3D_Моделі/AURA Fasad 14KG-1.png`,

  // ── Fasad Expo ────────────────────────────────────────────────────────────
  '2108-015': `${BASE_DIR}/WEB_Pasport_Aura_Fasad_Expo_ukr/3D_Моделі/AURA Fasad Expo 10L-1.png`,
  '2108-016': `${BASE_DIR}/WEB_Pasport_Aura_Fasad_Expo_ukr/3D_Моделі/AURA Fasad Expo 10L-1.png`,
  '2108-017': `${BASE_DIR}/WEB_Pasport_Aura_Fasad_Expo_ukr/3D_Моделі/AURA Fasad Expo 10L-1.png`,
  '2108-018': `${BASE_DIR}/WEB_Pasport_Aura_Fasad_Expo_ukr/3D_Моделі/AURA Fasad Expo 10L-1.png`,

  // ── Fasad Fort ────────────────────────────────────────────────────────────
  '2108-019': `${BASE_DIR}/WEB_Pasport_Aura_Fasad_Fort_ukr/3D_Моделі/AURA Fasad Fort 10L_Інтернет.png`,
  '2108-020': `${BASE_DIR}/WEB_Pasport_Aura_Fasad_Fort_ukr/3D_Моделі/AURA Fasad Fort 10L_Інтернет.png`,
  '2108-021': `${BASE_DIR}/WEB_Pasport_Aura_Fasad_Fort_ukr/3D_Моделі/AURA Fasad Fort 10L_Інтернет.png`,
  '2108-022': `${BASE_DIR}/WEB_Pasport_Aura_Fasad_Fort_ukr/3D_Моделі/AURA Fasad Fort 10L_Інтернет.png`,

  // ── Lux Pro 3 ─────────────────────────────────────────────────────────────
  '2109-008': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_3_ukr/3D_Моделі/AURA Luxpro 3 1L-1.png`,
  '2109-009': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_3_ukr/3D_Моделі/AURA Luxpro 3 2.85L-1.png`,
  '2109-010': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_3_ukr/3D_Моделі/AURA Luxpro 3 4.75L-1.png`,
  '2109-011': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_3_ukr/3D_Моделі/AURA Luxpro 3 9.5L-1.png`,

  // ── Luxpro 1 ──────────────────────────────────────────────────────────────
  '2109-012': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_1_ukr/3D_Моделі/AURA Luxpro 1 1L-1.png`,
  '2109-013': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_1_ukr/3D_Моделі/AURA Luxpro 1 2.85L-1.png`,
  '2109-014': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_1_ukr/3D_Моделі/AURA Luxpro 1 4.75L-1.png`,
  '2109-015': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_1_ukr/3D_Моделі/AURA Luxpro 1 9.5L-1.png`,

  // ── Luxpro 7 ──────────────────────────────────────────────────────────────
  '2109-016': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_7_ukr/3D_Моделі/AURA Luxpro 7 1L-1.png`,
  '2109-017': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_7_ukr/3D_Моделі/AURA Luxpro 7 2.85L-1.png`,
  '2109-018': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_7_ukr/3D_Моделі/AURA Luxpro 7 4.75L-1.png`,
  '2109-019': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_7_ukr/3D_Моделі/AURA Luxpro 7 9.5L-1.png`,

  // ── Luxpro 10 ─────────────────────────────────────────────────────────────
  '2109-020': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_10_ukr/3D_Моделі/AURA Luxpro 10 1L-1.png`,
  '2109-021': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_10_ukr/3D_Моделі/AURA Luxpro 10 2.85L-1.png`,
  '2109-022': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_10_ukr/3D_Моделі/AURA Luxpro 10 4.75L-1.png`,
  '2109-023': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_10_ukr/3D_Моделі/AURA Luxpro 10 9.5L-1.png`,

  // ── Luxpro Thermo ─────────────────────────────────────────────────────────
  '2109-024': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_Thermo_ukr/3D_Моделі/AURA Luxpro Thermo 0,75L-1.png`,
  '2109-025': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_Thermo_ukr/3D_Моделі/AURA Luxpro Thermo 0,75L-1.png`,
  '2109-026': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_Thermo_ukr/3D_Моделі/AURA Luxpro Thermo 2,2L-1.png`,

  // ── Luxpro Thermo Matt ────────────────────────────────────────────────────
  '2109-027': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_Thermo_Matt_ukr/3D_Моделі/AURA Luxpro Thermo Matt 0,75L-1.png`,
  '2109-028': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_Thermo_Matt_ukr/3D_Моделі/AURA Luxpro Thermo Matt 0,75L-1.png`,
  '2109-029': `${BASE_DIR}/WEB_Pasport_Aura_Luxpro_Thermo_Matt_ukr/3D_Моделі/AURA Luxpro Thermo Matt 2,2L-1.png`,

  // ── Malare ────────────────────────────────────────────────────────────────
  '2109-030': `${BASE_DIR}/WEB_Pasport_Aura_Malare_ukr/3D_Моделі/AURA Malare 0.9L-1.png`,
  '2109-031': `${BASE_DIR}/WEB_Pasport_Aura_Malare_ukr/3D_Моделі/AURA Malare 3L-1.png`,
  '2109-032': `${BASE_DIR}/WEB_Pasport_Aura_Malare_ukr/3D_Моделі/AURA Malare 5L-1.png`,
  '2109-033': `${BASE_DIR}/WEB_Pasport_Aura_Malare_ukr/3D_Моделі/AURA Malare 10L-1.png`,

  // ── Mattlatex ─────────────────────────────────────────────────────────────
  '2109-034': `${BASE_DIR}/WEB_Pasport_Aura_Mattlatex_ukr/3D_Моделі/AURA Mattlatex 0.9L-2.png`,
  '2109-035': `${BASE_DIR}/WEB_Pasport_Aura_Mattlatex_ukr/3D_Моделі/AURA Mattlatex 3L-1.png`,
  '2109-036': `${BASE_DIR}/WEB_Pasport_Aura_Mattlatex_ukr/3D_Моделі/AURA Mattlatex 5L-1.png`,
  '2109-037': `${BASE_DIR}/WEB_Pasport_Aura_Mattlatex_ukr/3D_Моделі/AURA Mattlatex 10L-1.png`,

  // ── Neolatex ──────────────────────────────────────────────────────────────
  '2109-038': `${BASE_DIR}/WEB_Pasport_Aura_Neolatex_ukr/3D_Моделі/AURA Neolatex 0.9L-1.png`,
  '2109-039': `${BASE_DIR}/WEB_Pasport_Aura_Neolatex_ukr/3D_Моделі/AURA Neolatex 3L-1.png`,
  '2109-040': `${BASE_DIR}/WEB_Pasport_Aura_Neolatex_ukr/3D_Моделі/AURA Neolatex 5L-1.png`,
  '2109-041': `${BASE_DIR}/WEB_Pasport_Aura_Neolatex_ukr/3D_Моделі/AURA Neolatex 10L-1.png`,

  // ── Laky ──────────────────────────────────────────────────────────────────
  '2105-023': `${BASE_DIR}/WEB_Pasport_Aura_Aqua_Lakk_20_ukr/3D_Моделі/AURA Aqua Lack 20 1L-1.png`,
  '2105-024': `${BASE_DIR}/WEB_Pasport_Aura_Aqua_Lakk_20_ukr/3D_Моделі/AURA Aqua Lack 20 2,5L-1.png`,
  '2105-025': `${BASE_DIR}/WEB_Pasport_Aura_Aqua_Lakk_20_ukr/3D_Моделі/AURA Aqua Lack 20 10L-1.png`,
  '2105-026': `${BASE_DIR}/WEB_Pasport_Aura_Aqua_Lakk_70_ukr/3D_Моделі/AURA Aqua Lack 70 1L-1.png`,
  '2105-027': `${BASE_DIR}/WEB_Pasport_Aura_Aqua_Lakk_70_ukr/3D_Моделі/AURA Aqua Lack 70 2,5L-1.png`,
  '2105-028': `${BASE_DIR}/WEB_Pasport_Aura_Aqua_Lakk_70_ukr/3D_Моделі/AURA Aqua Lack 70 10L-1.png`,
  '2105-029': `${BASE_DIR}/WEB_Pasport_Aura_Dekor_Lack_ukr/3D_Моделі/AURA Dekor Lack 0,75L-1.png`,
  '2105-030': `${BASE_DIR}/WEB_Pasport_Aura_Dekor_Lack_ukr/3D_Моделі/AURA Dekor Lack 2,5L-1.png`,
  '2105-031': `${BASE_DIR}/WEB_Pasport_Aura_Dekor_Lack_ukr/3D_Моделі/AURA Dekor Lack 10L-1.png`,
  '2105-032': `${BASE_DIR}/WEB_Pasport_Aura_Dekor_Lack_Matt_ukr/3D_Моделі/Aura Dekor Lack Matt 0,75L - 1.png`,
  '2105-033': `${BASE_DIR}/WEB_Pasport_Aura_Dekor_Lack_Matt_ukr/3D_Моделі/Aura Dekor Lack Matt 2,5L - 1.png`,
  '2105-034': `${BASE_DIR}/WEB_Pasport_Aura_Dekor_Lack_Matt_ukr/3D_Моделі/Aura Dekor Lack Matt 10L - 1.png`,
};

async function processAndUpload(sku, srcPath) {
  if (!fs.existsSync(srcPath)) {
    console.warn(`  ⚠ Not found: ${srcPath}`);
    return;
  }

  try {
    const meta = await sharp(srcPath).metadata();

    // Step 1: trim → PNG buffer (NOT raw)
    const trimBuf = await sharp(srcPath)
      .flatten({ background: { r: 255, g: 255, b: 255 } }) // flatten alpha over white
      .trim({ threshold: 25 })
      .png()
      .toBuffer();

    // Get trimmed dimensions
    const trimMeta = await sharp(trimBuf).metadata();
    const tw = trimMeta.width;
    const th = trimMeta.height;
    const padding = Math.round(Math.max(tw, th) * PAD_PCT);

    // Step 2: add padding + resize (feed PNG buffer directly)
    const processed = await sharp(trimBuf)
      .extend({
        top: padding, bottom: padding, left: padding, right: padding,
        background: { r: 255, g: 255, b: 255 }
      })
      .resize(OUT_SIZE, OUT_SIZE, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255 }
      })
      .png({ compressionLevel: 8 })
      .toBuffer();

    // Step 3: Upload
    const storagePath = `aura/${sku}.png`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, processed, {
        contentType: 'image/png',
        upsert: true,
      });

    if (error) throw new Error(error.message);

    const origKB = Math.round(fs.statSync(srcPath).size / 1024);
    const newKB  = Math.round(processed.length / 1024);
    console.log(`  ✓ ${sku}  ${meta.width}x${meta.height}→${OUT_SIZE}x${OUT_SIZE}  [crop ${tw}x${th}+pad${padding}]  ${origKB}→${newKB}KB`);
  } catch (err) {
    console.error(`  ✗ ${sku}: ${err.message}`);
  }
}

async function main() {
  console.log(`Processing ${Object.keys(SKU_IMAGES).length} images (trim + pad + resize to ${OUT_SIZE}px)...\n`);
  for (const [sku, src] of Object.entries(SKU_IMAGES)) {
    await processAndUpload(sku, src);
  }
  console.log('\nDone!');
}

main().catch(console.error);
