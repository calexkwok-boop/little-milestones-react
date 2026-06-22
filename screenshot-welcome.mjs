import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 390, height: 844 });

await page.setContent(`
<!DOCTYPE html>
<html>
<head>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Source+Serif+4:ital,wght@0,400;1,400&family=Inter:wght@400;600;700&family=Cormorant+Garamond:ital,wght@1,700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #E8F0E4; width: 390px; height: 844px; display: flex; flex-direction: column; }
    .screen { flex: 1; display: flex; flex-direction: column; padding: 60px 28px 48px; }
  </style>
</head>
<body>
  <div class="screen">
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;">
      <div style="width:64px;height:64px;border-radius:20px;background:#4A5E50;display:inline-flex;align-items:center;justify-content:center;margin-bottom:20px;">
        <span style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:46px;font-weight:700;color:#C8993E;line-height:1;margin-top:4px;">P</span>
      </div>
      <h1 style="font-family:'Playfair Display',serif;font-size:36px;color:#2C3828;margin:0 0 8px;line-height:1.1;">Patina</h1>
      <p style="font-family:'Source Serif 4',serif;font-style:italic;font-size:15px;color:#7A8C78;line-height:1.8;margin:0 0 32px;">For all the things you wish they knew.</p>

      <div style="background:#F8FAF6;border:1px solid #C4D8C0;border-radius:16px;padding:22px 22px 18px;width:100%;margin-bottom:32px;text-align:left;">
        <p style="font-family:'Source Serif 4',serif;font-style:italic;font-size:12px;color:#9AA89C;margin:0 0 10px;">Dear Ellie,</p>
        <p style="font-family:'Source Serif 4',serif;font-style:italic;font-size:15px;color:#2C3828;line-height:1.75;margin:0 0 14px;">Patina is the beauty that comes with age. These letters are my way of making sure you always know how much you were loved — not just in the big moments, but in all the quiet ones too.</p>
        <p style="font-family:'Source Serif 4',serif;font-style:italic;font-size:13px;color:#9AA89C;margin:0;">— Mom</p>
      </div>

      <button style="width:100%;background:#4A5E50;color:#fff;border:none;border-radius:12px;padding:16px;font-size:16px;font-weight:700;font-family:'Inter',sans-serif;cursor:pointer;">Begin</button>
    </div>
  </div>
</body>
</html>
`);

await page.waitForTimeout(2000);
await page.screenshot({ path: 'welcome-screenshot.png' });
await browser.close();
console.log('done');
