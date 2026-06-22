import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const imgData = readFileSync('./public/quill.png');
const b64 = imgData.toString('base64');

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

  // Sample the background colour from a corner pixel
  const bgR = px[0], bgG = px[1], bgB = px[2];

  for (let i = 0; i < px.length; i += 4) {
    const dr = Math.abs(px[i]   - bgR);
    const dg = Math.abs(px[i+1] - bgG);
    const db = Math.abs(px[i+2] - bgB);
    // If pixel is close to background, make transparent
    if (dr < 30 && dg < 30 && db < 30) {
      px[i+3] = 0;
    }
  }

  ctx.putImageData(d, 0, 0);

  // Find tight bounding box of non-transparent pixels
  let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const a = px[(y * canvas.width + x) * 4 + 3];
      if (a > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const pad = 20;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(canvas.width, maxX + pad); maxY = Math.min(canvas.height, maxY + pad);

  // Crop to bounding box
  const crop = document.createElement('canvas');
  crop.width = maxX - minX; crop.height = maxY - minY;
  crop.getContext('2d').drawImage(canvas, minX, minY, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return crop.toDataURL('image/png');
}, `data:image/png;base64,${b64}`);

const base64 = result.replace('data:image/png;base64,', '');
writeFileSync('./public/quill-transparent.png', Buffer.from(base64, 'base64'));
await browser.close();
console.log('done');
