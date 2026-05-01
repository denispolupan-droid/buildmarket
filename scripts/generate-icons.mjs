import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const sizes = [192, 512];
const inputPath = 'public/fixline-logo.png';
const outputDir = 'public';

async function generateIcons() {
  if (!fs.existsSync(inputPath)) {
    console.error(`Source image not found: ${inputPath}`);
    process.exit(1);
  }

  for (const size of sizes) {
    const outputPath = path.join(outputDir, `icon-${size}.png`);

    await sharp(inputPath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png()
      .toFile(outputPath);

    console.log(`Generated: ${outputPath}`);
  }

  console.log('Done!');
}

generateIcons().catch(console.error);
