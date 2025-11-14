import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const srcDir = 'apps/web/public/images/raw';
const outDir = 'apps/web/public/images/optimized';

const compositeOverlay = {
  input: Buffer.from([255, 255, 255, 230]),
  raw: { width: 1, height: 1, channels: 4 },
  tile: true,
  blend: 'overlay',
};

const processImages = async () => {
  fs.mkdirSync(outDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const inputPath = path.join(srcDir, entry.name);
    if (!/\.(png|jpe?g)$/i.test(inputPath)) {
      continue;
    }

    const base = path.parse(entry.name).name;
    const pipeline = sharp(inputPath)
      .modulate({ brightness: 0.95, saturation: 0.9 })
      .composite([compositeOverlay]);

    await Promise.all([
      pipeline.clone().webp({ quality: 82 }).toFile(path.join(outDir, `${base}.webp`)),
      pipeline.clone().avif({ quality: 60 }).toFile(path.join(outDir, `${base}.avif`)),
    ]);
  }

  console.log('Images processed →', outDir);
};

processImages().catch((error) => {
  console.error('Image processing failed', error);
  process.exit(1);
});
