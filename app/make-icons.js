/* Draws the app and tray icons (no image tools needed): a dark rounded
   square with an "on air" dot and broadcast waves — cyan for AutoDJ,
   red when someone is live.   node make-icons.js */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}
function png(size, px) {
    const raw = Buffer.alloc(size * (size * 4 + 1));
    for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Shapes in a 1×1 square; returns the colour at a point, or null. */
function paint(x, y, accent, withBg) {
    const cx = 0.5, cy = 0.5, dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    const ang = Math.abs(Math.atan2(dy, Math.abs(dx)));        // 0 = level with the dot
    if (d < 0.11) return accent;                                // the dot
    for (const [r, w] of [[0.24, 0.055], [0.37, 0.055]]) {        // two waves each side
        if (Math.abs(d - r) < w / 2 && ang < 0.75) return accent;
    }
    if (withBg) {                                               // rounded square
        const m = 0.04, rad = 0.2, qx = Math.max(Math.abs(dx) - (0.5 - m - rad), 0), qy = Math.max(Math.abs(dy) - (0.5 - m - rad), 0);
        if (Math.hypot(qx, qy) < rad) return [26, 7, 51];
    }
    return null;
}

function draw(size, accentHex, withBg) {
    const accent = hex(accentHex), px = Buffer.alloc(size * size * 4), S = 4;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
            const c = paint((x + (sx + 0.5) / S) / size, (y + (sy + 0.5) / S) / size, accent, withBg);
            if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
        const i = (y * size + x) * 4;
        if (a) { px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a; px[i + 3] = Math.round(255 * a / (S * S)); }
    }
    return png(size, px);
}

const out = path.join(__dirname, 'icons');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon.png'), draw(512, '#2be6ff', true));
for (const [name, color] of [['tray-auto', '#2be6ff'], ['tray-live', '#ff3048'], ['tray-off', '#8a8a9a']]) {
    fs.writeFileSync(path.join(out, name + '.png'), draw(32, color, true));
    fs.writeFileSync(path.join(out, name + '@2x.png'), draw(64, color, true));
}
console.log('icons written to', out);
