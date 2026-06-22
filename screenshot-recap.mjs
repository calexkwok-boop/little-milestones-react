import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 800, height: 844 });

const card = (subtitle) => `
  <div class="overlay">
    <p class="month-label">May 2026</p>
    <h1>The days are long, but the years are short.</h1>
    <p class="subtitle">${subtitle}</p>
    <div class="tiles">
      <div class="tile"><div class="tile-num">7</div><div class="tile-label">letters</div></div>
      <div class="tile"><div class="tile-num">2</div><div class="tile-label">milestones</div></div>
      <div class="tile"><div class="tile-num">11</div><div class="tile-label">photos</div></div>
    </div>
    <button class="btn">Keep going</button>
  </div>
`;

await page.setContent(`
<!DOCTYPE html>
<html>
<head>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Source+Serif+4:ital@0;1&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #1a2a1a; display: flex; gap: 2px; width: 800px; height: 844px; }
    .overlay { flex: 1; background: #2C3828; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 28px; }
    .month-label { font-size: 11px; font-weight: 700; color: rgba(200,153,62,0.8); letter-spacing: 1.6px; text-transform: uppercase; margin-bottom: 16px; font-family: 'Inter', sans-serif; }
    h1 { font-family: 'Playfair Display', serif; font-size: 28px; color: #fff; text-align: center; margin-bottom: 10px; line-height: 1.25; }
    .subtitle { font-family: 'Source Serif 4', serif; font-style: italic; font-size: 15px; color: rgba(255,255,255,0.5); text-align: center; margin-bottom: 32px; line-height: 1.6; }
    .tiles { display: flex; gap: 10px; width: 100%; margin-bottom: 32px; }
    .tile { flex: 1; background: rgba(255,255,255,0.07); border-radius: 14px; padding: 16px 8px; text-align: center; }
    .tile-num { font-size: 32px; font-weight: 800; color: #C8993E; margin-bottom: 4px; line-height: 1; font-family: 'Inter', sans-serif; }
    .tile-label { font-size: 10px; color: rgba(255,255,255,0.45); font-weight: 600; font-family: 'Inter', sans-serif; }
    .btn { background: #C8993E; color: #fff; border: none; border-radius: 12px; padding: 13px 32px; font-size: 14px; font-weight: 700; font-family: 'Inter', sans-serif; }
    .label { color: rgba(255,255,255,0.3); font-family: 'Inter', sans-serif; font-size: 11px; text-align: center; padding: 8px 0 0; letter-spacing: 0.5px; }
  </style>
</head>
<body>
  ${card('You are an amazing parent.')}
  ${card("They're lucky to have you.")}
</body>
</html>
`);

await page.waitForTimeout(1500);
await page.screenshot({ path: 'recap-screenshot.png' });
await browser.close();
console.log('done');
