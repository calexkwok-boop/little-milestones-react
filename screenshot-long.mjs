import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 560, height: 900 });

const longText = 'Today you took your first unassisted steps across the living room. You were so proud of yourself — and honestly, we were beside ourselves. Dad had to leave the room because he was crying. You looked back at us both with the biggest grin, like you knew exactly what you had done. These are the moments I never want to forget. I have been writing these letters since before you were born, wondering what kind of person you would become. I had all these theories and hopes and fears. But watching you today, toddling across the floor with your arms out like you were flying, I realized that who you are is already so much better than anything I could have imagined. You are fearless and joyful and you laugh with your whole body. You fall down and get right back up. I think I could learn a lot from you, honestly. I want you to know that every single day with you is the greatest privilege of my life. Even the hard days — especially the hard days. I love you more than I will ever be able to say.';

await page.setContent(`
<!DOCTYPE html>
<html>
<head>
  <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;1,400&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #C4D8C0; display: flex; flex-direction: column; align-items: center; padding: 20px; gap: 12px; }
    canvas { max-width: 520px; width: 100%; border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,.18); }
  </style>
</head>
<body>
<canvas id="c"></canvas>
<script>
function ctxRoundRect(ctx,x,y,w,h,r,fill){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();ctx.fillStyle=fill;ctx.fill();}
function ctxWrapText(ctx,text,maxW){const words=text.split(' '),lines=[];let line='';for(const w of words){const t=line?line+' '+w:w;if(ctx.measureText(t).width>maxW&&line){lines.push(line);line=w;}else line=t;}if(line)lines.push(line);return lines;}

async function draw() {
  await document.fonts.ready;
  await Promise.allSettled([
    document.fonts.load('italic 400 42px "Source Serif 4"'),
    document.fonts.load('600 28px Inter'),
  ]);

  const W=1080, PAD=72, CARD_R=44;
  const text = ${JSON.stringify(longText)};

  const mc = document.createElement('canvas'); mc.width = W;
  const mctx = mc.getContext('2d');
  mctx.font = 'italic 400 42px "Source Serif 4"';
  const bodyLines = ctxWrapText(mctx, text, W - PAD*2);
  const textH = 60 + bodyLines.length*64 + 12 + 52 + 28 + 2 + 36 + 40 + 80;
  const cardTop = 60, H = cardTop + textH + 60;

  const canvas = document.getElementById('c');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#E8F0E4'; ctx.fillRect(0,0,W,H);
  ctxRoundRect(ctx, 0, cardTop, W, H-cardTop+20, CARD_R, '#F8FAF6');

  let y = cardTop + 80;
  ctx.font = '400 160px Georgia, serif'; ctx.fillStyle = '#CCDAC8';
  ctx.textAlign = 'right'; ctx.fillText('“', W-PAD+24, cardTop+130); ctx.textAlign = 'left';

  ctx.font = 'italic 400 38px "Source Serif 4"'; ctx.fillStyle = '#9AA89C';
  ctx.fillText('Dear Ellie,', PAD, y); y += 60;

  ctx.font = 'italic 400 42px "Source Serif 4"'; ctx.fillStyle = '#2C3828';
  bodyLines.forEach(line => { ctx.fillText(line, PAD, y); y += 64; });
  y += 12;

  ctx.font = 'italic 400 36px "Source Serif 4"'; ctx.fillStyle = '#9AA89C';
  ctx.fillText('— Mom', PAD, y); y += 52;

  y += 28; ctx.fillStyle = '#CCDAC8'; ctx.fillRect(PAD, y, W-PAD*2, 1.5); y += 36;

  ctx.font = '600 28px Inter'; ctx.fillStyle = '#9AA89C';
  ctx.fillText('June 15, 2025', PAD, y);
  ctx.fillStyle = '#C8993E'; ctx.textAlign = 'right';
  ctx.fillText('Patina', W-PAD, y); ctx.textAlign = 'left';

  window._done = true;
}
draw();
</script>
</body>
</html>
`);

await page.waitForFunction(() => window._done === true, { timeout: 12000 });
await page.waitForTimeout(400);
const cardH = await page.evaluate(() => document.querySelector('canvas').getBoundingClientRect().bottom + 24);
await page.setViewportSize({ width: 560, height: Math.ceil(cardH) });
await page.screenshot({ path: 'sharecard-long.png' });
await browser.close();
console.log('done');
