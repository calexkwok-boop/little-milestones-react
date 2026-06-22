import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 390, height: 120 });

await page.setContent(`
<!DOCTYPE html>
<html>
<head>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #E8F0E4; padding: 22px 18px; }
.header { display: flex; align-items: center; justify-content: space-between; }
.left { display: flex; align-items: center; gap: 10px; }
.date { font-family: Inter, sans-serif; font-size: 12px; color: #9AA89C; margin-bottom: 6px; }
h1 { font-family: 'Playfair Display', serif; font-size: 26px; color: #2C3828; font-weight: 700; }
.search { width: 36px; height: 36px; border-radius: 50%; background: #fff; border: 1px solid #CCDAC8; display: flex; align-items: center; justify-content: center; }
</style>
</head>
<body>
<div class="header">
  <div class="left">
    <div>
      <p class="date">Monday, June 22</p>
      <h1>Patina</h1>
    </div>
    <img src="http://localhost:5177/quill-no-background.png" style="width:38px;height:38px;object-fit:contain"/>
  </div>
  <div class="search">🔍</div>
</div>
</body>
</html>
`);

await page.waitForTimeout(2000);
await page.screenshot({ path: 'logo-preview.png' });
await browser.close();
console.log('done');
