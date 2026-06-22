import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 320, height: 260 });

await page.setContent(`
<!DOCTYPE html>
<html>
<head>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #E8F0E4; display: flex; align-items: center; justify-content: center; height: 260px; gap: 40px; }
.logo { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.badge { width: 76px; height: 76px; border-radius: 24px; background: #4A5E50; overflow: hidden; }
.badge img { width: 100%; height: 100%; object-fit: cover; }
h1 { font-family: 'Playfair Display', serif; font-size: 28px; color: #2C3828; }
</style>
</head>
<body>
<div class="logo">
  <div class="badge"><img src="http://localhost:5177/quill.png"/></div>
</div>
<div class="logo">
  <div class="badge"><img src="http://localhost:5177/quill.png"/></div>
  <h1>Patina</h1>
</div>
</body>
</html>
`);

await page.waitForTimeout(2000);
await page.screenshot({ path: 'logo-preview.png' });
await browser.close();
console.log('done');
