import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const srcDir = 'apps/web/public/images/raw';
const outDir = 'apps/web/public/images/optimized';

const overlay = {
  input: Buffer.from([255, 255, 255, 230]),
  raw: { width: 1, height: 1, channels: 4 },
  tile: true,
  blend: 'overlay'
};

const isImage = (file) => /\.(png|jpe?g)$/i.test(file);

const processFile = async (fileName) => {
  const base = path.parse(fileName).name;
  const fullPath = path.join(srcDir, fileName);
  const pipeline = sharp(fullPath)
    .modulate({ brightness: 0.95, saturation: 0.9 })
    .composite([overlay]);

  await Promise.all([
    pipeline.clone().webp({ quality: 82 }).toFile(path.join(outDir, `${base}.webp`)),
    pipeline.clone().avif({ quality: 60 }).toFile(path.join(outDir, `${base}.avif`))
  ]);
};

const processImages = async () => {
  if (!fs.existsSync(srcDir)) {
    throw new Error(`Source directory not found: ${srcDir}`);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  const tasks = entries
    .filter((entry) => entry.isFile() && isImage(entry.name))
    .map((entry) => processFile(entry.name));

  await Promise.all(tasks);
  console.log('Images processed →', outDir);
};

processImages().catch((err) => {
  console.error('Image processing failed', err);
  process.exit(1);
});
