const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const pngToIcoModule = require("png-to-ico");
const pngToIco = pngToIcoModule.default || pngToIcoModule;

const rootDir = path.resolve(__dirname, "..");
const sourceSvg = path.join(rootDir, "assets", "icon.svg");
const outDir = path.join(rootDir, "build");
const sizes = [16, 24, 32, 48, 64, 128, 256];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const pngPaths = [];
  for (const size of sizes) {
    const outPath = path.join(outDir, `icon-${size}.png`);
    await sharp(sourceSvg)
      .resize(size, size)
      .png()
      .toFile(outPath);
    pngPaths.push(outPath);
  }

  const icoBuffer = await pngToIco(pngPaths);
  fs.writeFileSync(path.join(outDir, "icon.ico"), icoBuffer);
  fs.copyFileSync(path.join(outDir, "icon-256.png"), path.join(outDir, "icon.png"));

  console.log(`[icons] wrote ${path.relative(rootDir, path.join(outDir, "icon.ico"))}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
