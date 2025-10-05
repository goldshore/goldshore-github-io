import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const srcDir = 'apps/web/public/images/raw';
const outDir = 'apps/web/public/images/optimized';

fs.mkdirSync(outDir, { recursive: true });

for (const entry of fs.readdirSync(srcDir)) {
  const absolute = path.join(srcDir, entry);
  if (!fs.statSync(absolute).isFile()) continue;
  if (!/\.(png|jpe?g)$/i.test(entry)) continue;

  const base = path.parse(entry).name;
  const pipeline = sharp(absolute)
    .modulate({ brightness: 0.95, saturation: 0.9 })
    .composite([
      {
        input: Buffer.from([255, 255, 255, 230]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: 'overlay'
      }
    ]);

  await pipeline.webp({ quality: 82 }).toFile(path.join(outDir, `${base}.webp`));
  await pipeline.avif({ quality: 60 }).toFile(path.join(outDir, `${base}.avif`));
}

console.log('Images processed →', outDir);
