import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const srcDir = "apps/web/public/images/raw";
const outDir = "apps/web/public/images/optimized";

if (!fs.existsSync(srcDir)) {
  console.log("Source directory missing, skipping image optimisation.");
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });

const files = fs.readdirSync(srcDir);

for (const file of files) {
  if (!/\.(jpe?g|png)$/i.test(file)) {
    continue;
  }

  const sourcePath = path.join(srcDir, file);
  const base = path.parse(file).name;
  const image = sharp(sourcePath).modulate({ brightness: 0.98, saturation: 0.92 });

  await Promise.all([
    image.clone().webp({ quality: 82, effort: 4 }).toFile(path.join(outDir, `${base}.webp`)),
    image.clone().avif({ quality: 75 }).toFile(path.join(outDir, `${base}.avif`))
  ]);

  console.log(`✓ Optimised ${file}`);
}

console.log("✓ Image optimisation complete");
