import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const imgData = readFileSync('./public/quill.png');
const b64 = `data:image/png;base64,${imgData.toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<canvas id="c"></canvas>`);

const result = await page.evaluate(async (src) => {
  const img = new Image();
  await new Promise(r => { img.onload = r; img.src = src; });

  const canvas = document.getElementById('c');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = d.data;

  // Target the known green background colour #4A5E50 = rgb(74, 94, 80)
  const bgR = 74, bgG = 94, bgB = 80;

  for (let i = 0; i < px.length; i += 4) {
    const dr = Math.abs(px[i]   - bgR);
    const dg = Math.abs(px[i+1] - bgG);
    const db = Math.abs(px[i+2] - bgB);
    if (dr < 40 && dg < 40 && db < 40) {
      px[i+3] = 0;
    }
  }

  ctx.putImageData(d, 0, 0);

  // Crop to bounding box
  let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (px[(y * canvas.width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const pad = 24;
  // Use square canvas centred on bounding box so the quill is visually centred
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const half = Math.max(maxX - minX, maxY - minY) / 2 + pad;
  const sx = Math.max(0, Math.round(cx - half));
  const sy = Math.max(0, Math.round(cy - half));
  const size = Math.round(half * 2);

  const crop = document.createElement('canvas');
  crop.width = size; crop.height = size;
  crop.getContext('2d').drawImage(canvas, sx, sy, size, size, 0, 0, size, size);
  return crop.toDataURL('image/png');
}, b64);

const buf = Buffer.from(result.replace('data:image/png;base64,', ''), 'base64');
writeFileSync('./public/quill-no-background.png', buf);
await browser.close();
console.log('done');
