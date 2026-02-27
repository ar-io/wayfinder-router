#!/usr/bin/env bun
/**
 * Generate .ico file from SVG source.
 * Produces a multi-size ICO (16, 32, 48, 64, 128, 256) with embedded PNGs.
 *
 * Usage: bun run scripts/generate-icon.ts
 * Requires: sharp (devDependency)
 */

import sharp from "sharp";

const SVG_PATH = "./assets/icon.svg";
const ICO_PATH = "./assets/icon.ico";
const SIZES = [16, 32, 48, 64, 128, 256];

const svgBuffer = await Bun.file(SVG_PATH).arrayBuffer();

// Generate PNG buffers at each size
const pngBuffers: Buffer[] = [];
for (const size of SIZES) {
  const png = await sharp(Buffer.from(svgBuffer))
    .resize(size, size)
    .png()
    .toBuffer();
  pngBuffers.push(png);
}

// Build ICO file (PNG-embedded format)
// ICO header: 6 bytes
// Directory entries: 16 bytes each
// Then PNG data blocks
const headerSize = 6;
const dirEntrySize = 16;
const dirSize = dirEntrySize * SIZES.length;
let dataOffset = headerSize + dirSize;

// ICO header
const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0); // Reserved
header.writeUInt16LE(1, 2); // Type: 1 = ICO
header.writeUInt16LE(SIZES.length, 4); // Number of images

// Directory entries
const dirEntries = Buffer.alloc(dirSize);
for (let i = 0; i < SIZES.length; i++) {
  const offset = i * dirEntrySize;
  const size = SIZES[i];
  dirEntries.writeUInt8(size < 256 ? size : 0, offset + 0); // Width (0 = 256)
  dirEntries.writeUInt8(size < 256 ? size : 0, offset + 1); // Height (0 = 256)
  dirEntries.writeUInt8(0, offset + 2); // Color palette
  dirEntries.writeUInt8(0, offset + 3); // Reserved
  dirEntries.writeUInt16LE(1, offset + 4); // Color planes
  dirEntries.writeUInt16LE(32, offset + 6); // Bits per pixel
  dirEntries.writeUInt32LE(pngBuffers[i].length, offset + 8); // Image size
  dirEntries.writeUInt32LE(dataOffset, offset + 12); // Image offset
  dataOffset += pngBuffers[i].length;
}

const ico = Buffer.concat([header, dirEntries, ...pngBuffers]);
await Bun.write(ICO_PATH, ico);

console.log(
  `Generated ${ICO_PATH} (${SIZES.join(", ")}px, ${ico.length} bytes)`,
);
