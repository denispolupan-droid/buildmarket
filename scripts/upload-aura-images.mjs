/**
 * Upload AURA product images to Supabase Storage and update `image` field in products table.
 * Usage: node scripts/upload-aura-images.mjs
 */
import { createClient } from '@supabase/supabase-js';
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

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Map: SKU → source image file (absolute path)
const SKU_IMAGES = {
  // ── Fix PVA ───────────────────────────────────────────────────────────────
  '1604-021': `${BASE_DIR}/WEB_Pasport_Aura_Fix_PVA_ukr/3D_Моделі/WEB/1080x1080_AURA_Fix_PVA_1L_F.png`,
  '1604-022': `${BASE_DIR}/WEB_Pasport_Aura_Fix_PVA_ukr/3D_Моделі/WEB/1080x1080_AURA_Fix_PVA_1L_F.png`,
  '1604-023': `${BASE_DIR}/WEB_Pasport_Aura_Fix_PVA_ukr/3D_Моделі/WEB/1080x1080_AURA_Fix_PVA_3L_F.png`,
  '1604-024': `${BASE_DIR}/WEB_Pasport_Aura_Fix_PVA_ukr/3D_Моделі/WEB/1080x1080_AURA_Fix_PVA_5L_F.png`,
  '1604-025': `${BASE_DIR}/WEB_Pasport_Aura_Fix_PVA_ukr/3D_Моделі/WEB/1080x1080_AURA_Fix_PVA_5L_F.png`,

  // ── AquaGrund ─────────────────────────────────────────────────────────────
  '1204-013': `${BASE_DIR}/WEB_Pasport_Aura_Koncentrat_Aquagrund_ukr/3D_Моделі/AURA Koncentrat AquaGrund 0,5L_1.png`,
  '1204-014': `${BASE_DIR}/WEB_Pasport_Aura_Koncentrat_Aquagrund_ukr/3D_Моделі/AURA Koncentrat AquaGrund 1L_1.png`,
  '1204-015': `${BASE_DIR}/WEB_Pasport_Aura_Koncentrat_Aquagrund_ukr/3D_Моделі/AURA Koncentrat AquaGrund 3L.png`,
  '1204-016': `${BASE_DIR}/WEB_Pasport_Aura_Koncentrat_Aquagrund_ukr/3D_Моделі/AURA Koncentrat AquaGrund 10L.png`,

  // ── GammaGrund ────────────────────────────────────────────────────────────
  '1204-017': `${BASE_DIR}/WEB_Pasport_Aura_Koncentrat_GammaGrund_ukr/3D_Моделі/AURA Koncentrat GammaGrund 0,5L_1.png`,
  '1204-018': `${BASE_DIR}/WEB_Pasport_Aura_Koncentrat_GammaGrund_ukr/3D_Моделі/AURA Koncentrat GammaGrund 1L_1.png`,
  '1204-019': `${BASE_DIR}/WEB_Pasport_Aura_Koncentrat_GammaGrund_ukr/3D_Моделі/AURA Koncentrat GammaGrund 3L.png`,
  '1204-020': `${BASE_DIR}/WEB_Pasport_Aura_Koncentrat_GammaGrund_ukr/3D_Моделі/AURA Koncentrat GammaGrund 10L.png`,

  // ── Unigrund BioBlock ─────────────────────────────────────────────────────
  '1203-030': `${BASE_DIR}/WEB_Pasport_Aura_Unigrund_BioBlock_ukr/3D_Моделі/AURA Unigrund BioBlock 1L-1.png`,
  '1203-031': `${BASE_DIR}/WEB_Pasport_Aura_Unigrund_BioBlock_ukr/3D_Моделі/AURA Unigrund BioBlock 5L.png`,

  // ── Beton Kontakt ─────────────────────────────────────────────────────────
  '2100-022': `${BASE_DIR}/WEB_Pasport_Aura_Beton_Kontakt_ukr/3D_Моделі/AURA Beton Kontakt 5L-1.png`,
  '2100-023': `${BASE_DIR}/WEB_Pasport_Aura_Beton_Kontakt_ukr/3D_Моделі/AURA Beton Kontakt 5L-1.png`,
  '2100-024': `${BASE_DIR}/WEB_Pasport_Aura_Beton_Kontakt_ukr/3D_Моделі/AURA Beton Kontakt 14KG-1.png`,
  '2100-025': `${BASE_DIR}/WEB_Pasport_Aura_Beton_Kontakt_ukr/3D_Моделі/AURA Beton Kontakt 14KG-1.png`,

  // ── Lasur Aqua (all variants share same can shape, color in product name) ─
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

  // ── Fasad ─────────────────────────────────────────────────────────────────
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

  // ── Lux Pro 3 (folder: Luxpro_3) ─────────────────────────────────────────
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

  // ── Laky (Aqua Lakk, Dekor Lakk) ─────────────────────────────────────────
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

async function uploadImage(sku, srcPath) {
  if (!fs.existsSync(srcPath)) {
    console.warn(`  ⚠ File not found: ${srcPath}`);
    return null;
  }

  const fileBuffer = fs.readFileSync(srcPath);
  const storagePath = `aura/${sku}.png`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: 'image/png',
      upsert: true,
    });

  if (error) {
    console.error(`  ✗ Upload failed for ${sku}: ${error.message}`);
    return null;
  }

  return `/img/products/${storagePath}`;
}

async function main() {
  console.log(`Uploading ${Object.keys(SKU_IMAGES).length} images...\n`);

  const updates = [];

  for (const [sku, srcPath] of Object.entries(SKU_IMAGES)) {
    process.stdout.write(`  ${sku}...`);
    const imageUrl = await uploadImage(sku, srcPath);
    if (imageUrl) {
      updates.push({ sku, imageUrl });
      console.log(` ✓ ${imageUrl}`);
    }
  }

  console.log(`\nUpdating ${updates.length} product image fields in DB...`);

  for (const { sku, imageUrl } of updates) {
    const { error } = await supabase
      .from('products')
      .update({ image: imageUrl })
      .eq('sku', sku);

    if (error) {
      console.error(`  ✗ DB update failed for ${sku}: ${error.message}`);
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
