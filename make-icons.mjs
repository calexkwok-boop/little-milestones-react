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

    // Gradient background: lighter at top-left, darker at bottom-right
    const bg = ctx.createLinearGradient(0, 0, size * 0.6, size);
    bg.addColorStop(0, '#5C7263');
    bg.addColorStop(1, '#364840');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    // Subtle radial vignette: darken edges
    const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.25, size / 2, size / 2, size * 0.85);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size, size);

    // Subtle top highlight: soft white glow at top to simulate light source
    const shine = ctx.createRadialGradient(size * 0.5, 0, 0, size * 0.5, 0, size * 0.7);
    shine.addColorStop(0, 'rgba(255,255,255,0.13)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.fillRect(0, 0, size, size);

    // Drop shadow on the quill
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = size * 0.06;
    ctx.shadowOffsetX = size * 0.02;
    ctx.shadowOffsetY = size * 0.03;

    // Draw quill centred with 18% padding
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
