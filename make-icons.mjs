import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const imgData = readFileSync('./public/quill-no-background.png');
const b64 = `data:image/png;base64,${imgData.toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<canvas id="c"></canvas>`);

async function makeIcon(size) {
  return page.evaluate(async ({ src, size }) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = src; });

    const canvas = document.getElementById('c');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Green background
    ctx.fillStyle = '#4A5E50';
    ctx.fillRect(0, 0, size, size);

    // Scale quill to fill 82% of the icon, centred
    const padding = size * 0.10;
    const maxW = size - padding * 2;
    const maxH = size - padding * 2;
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const x = (size - w) / 2;
    const y = (size - h) / 2;
    ctx.drawImage(img, x, y, w, h);

    return canvas.toDataURL('image/png');
  }, { src: b64, size });
}

for (const size of [512, 192]) {
  const dataUrl = await makeIcon(size);
  const buf = Buffer.from(dataUrl.replace('data:image/png;base64,', ''), 'base64');
  writeFileSync(`./public/icon-${size}.png`, buf);
  console.log(`icon-${size}.png`);
}

await browser.close();
console.log('done');
