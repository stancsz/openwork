// Turn one brand-owned SVG/PNG into the asset files consumed by the existing
// web and desktop build. The derived files live under .brandkit/<id>/ and are
// disposable; distributors only edit brands/<id>/logo.svg.

import sharp from "sharp";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { REPO_ROOT } from "./config.mjs";

function writeIfChanged(path, content) {
  if (existsSync(path) && readFileSync(path).equals(content)) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return true;
}

function asSvg(source, sourcePath) {
  if (extname(sourcePath).toLowerCase() === ".svg") return source.toString("utf8");
  const mime = extname(sourcePath).toLowerCase() === ".jpg" || extname(sourcePath).toLowerCase() === ".jpeg"
    ? "image/jpeg"
    : "image/png";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><image href="data:${mime};base64,${source.toString("base64")}" width="1024" height="1024" preserveAspectRatio="xMidYMid meet"/></svg>\n`;
}

async function png(source, size) {
  return sharp(source)
    .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();
}

function pngToIco(pngBuffer, size) {
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(size >= 256 ? 0 : size, 6);
  header.writeUInt8(size >= 256 ? 0 : size, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(pngBuffer.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, pngBuffer]);
}

function pngToIcns(entries) {
  const chunks = entries.map(([type, pngBuffer]) => {
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, "ascii");
    header.writeUInt32BE(8 + pngBuffer.length, 4);
    return Buffer.concat([header, pngBuffer]);
  });
  const output = Buffer.alloc(8);
  output.write("icns", 0, 4, "ascii");
  output.writeUInt32BE(8 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4);
  return Buffer.concat([output, ...chunks]);
}

/** Generate the disposable asset set for a canonical brand image. */
export async function prepareBrandAssets(config) {
  if (!config.brand.image) return { generated: false, changed: 0 };

  const sourcePath = resolve(REPO_ROOT, config.brand.image);
  const source = readFileSync(sourcePath);
  const svg = Buffer.from(asSvg(source, sourcePath), "utf8");
  const png16 = await png(source, 16);
  const png32 = await png(source, 32);
  const png180 = await png(source, 180);
  const png256 = await png(source, 256);
  const png512 = await png(source, 512);
  const png1024 = await png(source, 1024);
  const assets = config.brand.assets;
  const outputs = [
    [assets.mark, svg],
    [assets.logo, svg],
    [assets.logoSquare, svg],
    [assets.favicon16, png16],
    [assets.favicon32, png32],
    [assets.appleTouchIcon, png180],
    [assets.desktopIconPng, png512],
    [assets.desktopIconIco, pngToIco(png256, 256)],
    [assets.desktopIconIcns, pngToIcns([["ic09", png512], ["ic10", png1024]])],
  ];

  let changed = 0;
  for (const [relativePath, content] of outputs) {
    if (writeIfChanged(resolve(REPO_ROOT, relativePath), content)) changed += 1;
  }
  return { generated: true, changed };
}
