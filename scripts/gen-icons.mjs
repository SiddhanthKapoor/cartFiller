// Generates the extension icon set as raw PNGs (no image deps needed).
// A rounded-square green gradient tile with a minimal shopping-bag glyph.
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

function crc32(buf) {
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
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Signed distance helpers (all coords normalized 0..1)
const roundedRectSdf = (x, y, cx, cy, hw, hh, r) => {
  const dx = Math.abs(x - cx) - (hw - r)
  const dy = Math.abs(y - cy) - (hh - r)
  const ox = Math.max(dx, 0)
  const oy = Math.max(dy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r
}

function renderIcon(size) {
  const px = Buffer.alloc(size * size * 4)
  const aa = 1.25 / size
  const smooth = (d) => Math.min(Math.max(0.5 - d / (2 * aa), 0), 1)

  for (let yi = 0; yi < size; yi++) {
    for (let xi = 0; xi < size; xi++) {
      const x = (xi + 0.5) / size
      const y = (yi + 0.5) / size
      const i = (yi * size + xi) * 4

      // Tile: rounded square, vertical green gradient
      const tile = smooth(roundedRectSdf(x, y, 0.5, 0.5, 0.5, 0.5, 0.24))
      const t = y
      let r = Math.round(52 + (34 - 52) * t)
      let g = Math.round(219 + (177 - 219) * t)
      let b = Math.round(102 + (76 - 102) * t)

      // Glyph: shopping bag (rounded-rect body + handle arc), drawn white
      const bodyD = roundedRectSdf(x, y, 0.5, 0.585, 0.21, 0.165, 0.07)
      const stroke = 0.045
      const bodyRing = Math.abs(bodyD + stroke / 2) - stroke / 2
      const handleR = 0.115
      const handleD =
        Math.abs(Math.hypot(x - 0.5, y - 0.435) - handleR) - stroke / 2
      const handle = y < 0.44 ? smooth(handleD) : 0
      const glyph = Math.max(smooth(bodyRing), handle)

      r = Math.round(r + (255 - r) * glyph)
      g = Math.round(g + (255 - g) * glyph)
      b = Math.round(b + (255 - b) * glyph)

      px[i] = r
      px[i + 1] = g
      px[i + 2] = b
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
