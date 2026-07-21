#!/usr/bin/env node
/**
 * Regenerate SentinelIQ raster brand assets from the vector source.
 *
 * Source of truth: public/favico/sentineliq-mark.svg (icon)
 *                  public/favico/sentineliq-logo.svg (wordmark, used for OG)
 *
 * Requires `sharp` (already a common transitive dep; install with
 * `npm i -D sharp` if missing). Run where node_modules is available:
 *   node scripts/generate-brand-icons.mjs
 *
 * Outputs the standard favicon/app-icon PNG sizes referenced by index.html
 * and the PWA manifest. favicon.ico is derived from the 32x32 PNG.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const favico = join(root, 'public', 'favico');

const PNG_TARGETS = [
  { file: 'favicon-16x16.png', size: 16 },
  { file: 'favicon-32x32.png', size: 32 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'android-chrome-192x192.png', size: 192 },
  { file: 'android-chrome-512x512.png', size: 512 },
  { file: 'worldmonitor-icon-1024.png', size: 1024 },
];

async function main() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('[brand-icons] `sharp` is not installed. Run: npm i -D sharp');
    process.exit(1);
  }

  const markSvg = await readFile(join(favico, 'sentineliq-mark.svg'));
  for (const { file, size } of PNG_TARGETS) {
    await sharp(markSvg, { density: 384 })
      .resize(size, size, { fit: 'contain', background: { r: 11, g: 15, b: 20, alpha: 1 } })
      .png()
      .toFile(join(favico, file));
    console.log(`[brand-icons] wrote ${file} (${size}px)`);
  }

  // OG image (1200x630) from the wordmark logo on brand background.
  const logoSvg = await readFile(join(favico, 'sentineliq-logo.svg'));
  await sharp({ create: { width: 1200, height: 630, channels: 4, background: { r: 11, g: 15, b: 20, alpha: 1 } } })
    .composite([{ input: await sharp(logoSvg, { density: 384 }).resize(920).png().toBuffer(), gravity: 'center' }])
    .png()
    .toFile(join(favico, 'og-image.png'));
  console.log('[brand-icons] wrote og-image.png (1200x630)');

  // favicon.ico from 32px (needs png-to-ico; optional).
  try {
    const pngToIco = (await import('png-to-ico')).default;
    const buf = await pngToIco([join(favico, 'favicon-32x32.png'), join(favico, 'favicon-16x16.png')]);
    await writeFile(join(favico, 'favicon.ico'), buf);
    console.log('[brand-icons] wrote favicon.ico');
  } catch {
    console.warn('[brand-icons] skipped favicon.ico (install `png-to-ico` to regenerate)');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
