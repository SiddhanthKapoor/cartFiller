// Generates the extension icon set as raw PNGs (no image deps).
// A black rounded-square tile with a white cart + chef-toque glyph, matching
// the CookCart mark and the brutalist black-and-white popup UI.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'public', 'icons')
const SIZES = [16, 32, 48, 128]

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function encodePng(size, pixels) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const roundedRectSdf = (x, y, cx, cy, hw, hh, r) => {
  const dx = Math.abs(x - cx) - (hw - r)
  const dy = Math.abs(y - cy) - (hh - r)
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r
}
// distance to a line segment
const segSdf = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
const ringSdf = (px, py, cx, cy, r) => Math.abs(Math.hypot(px - cx, py - cy) - r)

function renderIcon(size) {
  const px = Buffer.alloc(size * size * 4)
  const aa = 1.2 / size
  const smooth = (d) => Math.min(Math.max(0.5 - d / (2 * aa), 0), 1)
  const stroke = 0.05

  for (let yi = 0; yi < size; yi++) {
    for (let xi = 0; xi < size; xi++) {
      const x = (xi + 0.5) / size
      const y = (yi + 0.5) / size
      const i = (yi * size + xi) * 4

      // black rounded tile
      const tile = smooth(roundedRectSdf(x, y, 0.5, 0.5, 0.5, 0.5, 0.22))

      // --- white glyph: cart + toque (line art) ---
      // toque: three bumps as a rounded cap
      let toque = 1
      toque = Math.min(toque, Math.abs(ringSdf(x, y, 0.4, 0.34, 0.075)) - stroke / 2)
      toque = Math.min(toque, Math.abs(ringSdf(x, y, 0.52, 0.32, 0.08)) - stroke / 2)
      toque = Math.min(toque, Math.abs(ringSdf(x, y, 0.63, 0.35, 0.07)) - stroke / 2)
      // toque base band
      const band = Math.max(
        segSdf(x, y, 0.34, 0.42, 0.68, 0.42) - stroke / 2,
        -(y - 0.34),
      )
      // cart handle + basket (a simple cart outline)
      const handle = segSdf(x, y, 0.2, 0.5, 0.3, 0.5) - stroke / 2
      const basket =
        Math.min(
          segSdf(x, y, 0.3, 0.5, 0.36, 0.66),
          segSdf(x, y, 0.36, 0.66, 0.64, 0.66),
          segSdf(x, y, 0.64, 0.66, 0.72, 0.5),
          segSdf(x, y, 0.3, 0.5, 0.72, 0.5),
        ) - stroke / 2
      const wheels = Math.min(
        Math.abs(ringSdf(x, y, 0.42, 0.74, 0.035)) - stroke / 2,
        Math.abs(ringSdf(x, y, 0.6, 0.74, 0.035)) - stroke / 2,
      )
      const axle = segSdf(x, y, 0.42, 0.74, 0.6, 0.74) - stroke / 2

      const glyphD = Math.min(toque, band, handle, basket, wheels, axle)
      const glyph = smooth(glyphD) * tile

      // teal tile (#219ebd) with a cream-white cart+toque glyph
      const tileR = 33
      const tileG = 158
      const tileB = 189
      px[i] = Math.round(tileR + (255 - tileR) * glyph)
      px[i + 1] = Math.round(tileG + (250 - tileG) * glyph)
      px[i + 2] = Math.round(tileB + (223 - tileB) * glyph)
      px[i + 3] = Math.round(255 * tile)
    }
  }
  return px
}

mkdirSync(OUT_DIR, { recursive: true })
for (const size of SIZES) {
  writeFileSync(join(OUT_DIR, `icon-${size}.png`), encodePng(size, renderIcon(size)))
  console.log(`icon-${size}.png`)
}
