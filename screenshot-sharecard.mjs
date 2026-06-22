import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 540, height: 700 });

await page.setContent(`
<!DOCTYPE html>
<html>
<head>
  <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;1,400&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #C4D8C0; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    canvas { max-width: 100%; border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.18); }
  </style>
</head>
<body>
<canvas id="c"></canvas>
<script>
function ctxRoundRect(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function ctxWrapText(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

async function draw() {
  await document.fonts.ready;
  await Promise.allSettled([
    document.fonts.load('italic 400 42px "Source Serif 4"'),
    document.fonts.load('600 28px Inter'),
  ]);

  const W = 1080, H = 1350, PAD = 72;
  const canvas = document.getElementById('c');
  canvas.width = W; canvas.height = H;
  canvas.style.width = '500px';
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#E8F0E4';
  ctx.fillRect(0, 0, W, H);

  const cardTop = 100;

  ctxRoundRect(ctx, 0, cardTop, W, H - cardTop + 20, 44, '#F8FAF6');

  let y = cardTop + 80;

  // decorative quote mark
  ctx.font = '400 140px "Source Serif 4"';
  ctx.fillStyle = '#CCDAC8';
  ctx.textAlign = 'right';
  ctx.fillText('"', W - PAD + 10, cardTop + 118);
  ctx.textAlign = 'left';

  // salutation
  ctx.font = 'italic 400 38px "Source Serif 4"';
  ctx.fillStyle = '#9AA89C';
  ctx.fillText('Dear Ellie,', PAD, y);
  y += 60;

  // body
  const text = "Today you took your first unassisted steps across the living room. You were so proud of yourself — and honestly, we were beside ourselves. Dad had to leave the room because he was crying. You looked back at us both with the biggest grin, like you knew exactly what you had done. These are the moments I never want to forget.";
  ctx.font = 'italic 400 42px "Source Serif 4"';
  ctx.fillStyle = '#2C3828';
  const lines = ctxWrapText(ctx, text, W - PAD * 2);
  lines.slice(0, 10).forEach(line => { ctx.fillText(line, PAD, y); y += 64; });
  y += 12;

  // signature
  ctx.font = 'italic 400 36px "Source Serif 4"';
  ctx.fillStyle = '#9AA89C';
  ctx.fillText('— Mom', PAD, y);
  y += 52;

  // divider
  y += 28;
  ctx.fillStyle = '#CCDAC8';
  ctx.fillRect(PAD, y, W - PAD * 2, 1.5);
  y += 36;

  // date + branding
  ctx.font = '600 28px Inter';
  ctx.fillStyle = '#9AA89C';
  ctx.fillText('June 15, 2025', PAD, y);
  ctx.fillStyle = '#C8993E';
  ctx.textAlign = 'right';
  ctx.fillText('Patina', W - PAD, y);
  ctx.textAlign = 'left';

  window._done = true;
}

draw();
</script>
</body>
</html>
`);

await page.waitForFunction(() => window._done === true, { timeout: 10000 });
await page.waitForTimeout(400);
await page.screenshot({ path: 'sharecard-screenshot.png' });
await browser.close();
console.log('done');
