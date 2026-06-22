import { chromium } from 'playwright';

const SAMPLE_IMG = 'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?w=1200&q=85';

const CARD_JS = `
function ctxRoundRect(ctx,x,y,w,h,r,fill){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();ctx.fillStyle=fill;ctx.fill();}
function ctxWrapText(ctx,text,maxW){const words=text.split(' '),lines=[];let line='';for(const w of words){const t=line?line+' '+w:w;if(ctx.measureText(t).width>maxW&&line){lines.push(line);line=w;}else line=t;}if(line)lines.push(line);return lines;}
function loadImg(url){return new Promise((res,rej)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>res(i);i.onerror=rej;i.src=url;});}

async function drawCard(canvasId, photoUrl) {
  await document.fonts.ready;
  await Promise.allSettled([
    document.fonts.load('italic 400 42px "Source Serif 4"'),
    document.fonts.load('600 28px Inter'),
  ]);

  const W=1080,H=1350,PAD=72;
  const text="Today you took your first unassisted steps across the living room. You were so proud of yourself — and honestly, we were beside ourselves. Dad had to leave the room because he was crying. You looked back at us both with the biggest grin, like you knew exactly what you had done. These are the moments I never want to forget.";

  let photoImg=null;
  if(photoUrl){try{photoImg=await loadImg(photoUrl);}catch{}}
  if(photoImg&&photoImg.naturalWidth===0)photoImg=null;

  const canvas=document.getElementById(canvasId);
  canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');

  ctx.fillStyle='#E8F0E4';ctx.fillRect(0,0,W,H);

  let cardTop=100,hasPhoto=false;
  if(photoImg){
    const PHOTO_H=520;
    const scale=Math.max(W/photoImg.naturalWidth,PHOTO_H/photoImg.naturalHeight);
    const sw=W/scale,sh=PHOTO_H/scale;
    const sx=(photoImg.naturalWidth-sw)/2,sy=(photoImg.naturalHeight-sh)/2;
    ctx.save();ctx.beginPath();ctx.rect(0,0,W,PHOTO_H);ctx.clip();
    ctx.drawImage(photoImg,sx,sy,sw,sh,0,0,W,PHOTO_H);
    ctx.restore();
    cardTop=PHOTO_H-44;hasPhoto=true;
  }

  ctxRoundRect(ctx,0,cardTop,W,H-cardTop+20,44,'#F8FAF6');
  let y=cardTop+80;

  if(!hasPhoto){
    ctx.font='400 140px "Source Serif 4"';ctx.fillStyle='#CCDAC8';
    ctx.textAlign='right';ctx.fillText('"',W-PAD+10,cardTop+118);ctx.textAlign='left';
  }

  ctx.font='italic 400 38px "Source Serif 4"';ctx.fillStyle='#4A5E50';
  ctx.fillText('Dear Ellie,',PAD,y);y+=60;

  ctx.font='italic 400 42px "Source Serif 4"';ctx.fillStyle='#2C3828';
  const maxLines=hasPhoto?7:10;
  const bodyLines=ctxWrapText(ctx,text,W-PAD*2);
  bodyLines.slice(0,maxLines).forEach(line=>{ctx.fillText(line,PAD,y);y+=64;});
  if(bodyLines.length>maxLines){ctx.fillStyle='#9AA89C';ctx.fillText('…',PAD,y);y+=64;}
  y+=12;

  ctx.font='italic 400 36px "Source Serif 4"';ctx.fillStyle='#4A5E50';
  ctx.fillText('— Mom',PAD,y);y+=52;

  y+=28;ctx.fillStyle='#CCDAC8';ctx.fillRect(PAD,y,W-PAD*2,1.5);y+=36;

  ctx.font='600 28px Inter';ctx.fillStyle='#4A5E50';ctx.fillText('June 15, 2025',PAD,y);
  ctx.fillStyle='#C8993E';ctx.textAlign='right';ctx.fillText('Patina',W-PAD,y);ctx.textAlign='left';

  window._done=true;
}
`;

async function shot(label, outFile, photoUrl) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  // Simulate iPhone width so preview is accurate
  await page.setViewportSize({ width: 390, height: 900 });
  await page.setContent(`
<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;1,400&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#C4D8C0;display:flex;flex-direction:column;align-items:center;padding:14px;gap:8px}canvas{max-width:362px;width:100%;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.2)}p{font-family:sans-serif;font-size:11px;color:#4A5E50;font-weight:700;letter-spacing:.5px}</style>
</head><body>
<p>${label}</p><canvas id="c"></canvas>
<script>${CARD_JS}
drawCard('c',${photoUrl ? `'${photoUrl}'` : 'null'});
</script></body></html>`);

  await page.waitForFunction(() => window._done === true, { timeout: 15000 });
  await page.waitForTimeout(400);
  const h = await page.evaluate(() => document.querySelector('canvas').getBoundingClientRect().bottom + 20);
  await page.setViewportSize({ width: 390, height: Math.ceil(h) });
  await page.screenshot({ path: outFile });
  await browser.close();
  console.log(outFile);
}

await shot('With photo', 'sharecard-photo.png', SAMPLE_IMG);
await shot('Text only', 'sharecard-text.png', null);
console.log('done');
