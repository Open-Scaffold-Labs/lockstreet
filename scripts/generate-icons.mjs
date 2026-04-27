/**
 * One-shot icon generator. Reads public/favicon.svg and produces PNG icons.
 * Run: node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const svg = readFileSync(resolve(root, 'public/favicon.svg'));

// Maskable: solid background fills the full canvas with safe area for the logo.
// Android crops icons into circles/squircles - we need ~12% padding.
const maskable = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#000000"/>
  <text x="256" y="316" text-anchor="middle"
        font-family="system-ui, -apple-system, sans-serif"
        font-weight="800" font-size="220" letter-spacing="-6">
    <tspan fill="#ffffff">L</tspan><tspan fill="#c084fc">S</tspan>
  </text>
</svg>`);

const targets = [
  { name: 'icon-192.png',          input: svg,      size: 192 },
  { name: 'icon-512.png',          input: svg,      size: 512 },
  { name: 'icon-maskable-512.png', input: maskable, size: 512 },
  { name: 'apple-touch-icon.png',  input: svg,      size: 180 },
  { name: 'favicon-32.png',        input: svg,      size: 32  },
];

for (const t of targets) {
  const out = resolve(root, 'public', t.name);
  await sharp(t.input).resize(t.size, t.size).png().toFile(out);
  console.log(`wrote ${t.name} (${t.size}x${t.size})`);
}
console.log('done.');
