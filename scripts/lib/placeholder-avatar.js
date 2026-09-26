// A tiny, dependency-free PNG encoder for solid-color square avatars,
// used only by the cold-start seed script. Deliberately not pulling in
// an image library (sharp, canvas, etc.) just to render a flat color
// square — Node's built-in zlib is enough to build a valid PNG by hand.
// Displayed avatars are already clipped to a circle via borderRadius in
// both the web and native UI, so a plain color square underneath reads
// as a normal colored avatar (the same style Slack/Discord use for
// people without a photo).
import zlib from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// [r,g,b] each 0-255. Returns a PNG file buffer, `width` x `height` pixels.
export function solidColorPng([r, g, b], width = 256, height = width) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: RGB
  ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;
  const ihdr = chunk("IHDR", ihdrData);

  const rowLen = 1 + width * 3; // filter byte + RGB per pixel
  const raw = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowLen;
    raw[rowStart] = 0; // no filter
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 3;
      raw[px] = r; raw[px + 1] = g; raw[px + 2] = b;
    }
  }
  const idat = chunk("IDAT", zlib.deflateSync(raw));
  const iend = chunk("IEND", Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

// A small, pleasant palette (avoids anything too close to the app's own
// mustard/corpblue accent colors so avatars don't blend into UI chrome).
export const AVATAR_PALETTE = [
  [230, 126, 34], [41, 128, 185], [39, 174, 96], [155, 89, 182],
  [231, 76, 60], [26, 188, 156], [243, 156, 18], [52, 73, 94],
  [211, 84, 0], [22, 160, 133], [142, 68, 173], [192, 57, 43],
];

export function paletteColorFor(seedString) {
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) hash = (hash * 31 + seedString.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
