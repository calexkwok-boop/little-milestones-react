import { chromium } from 'playwright';

const SAMPLE_IMG = 'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?w=1200&q=85';

const CARD_JS = `
function ctxRoundRect(ctx,x,y,w,h,r,fill){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();ctx.fillStyle=fill;ctx.fill();}
function ctxWrapText(ctx,text,maxW){const words=text.split(' '),lines=[];let line='';for(const w of words){const t=line?line+' '+w:w;if(ctx.measureText(t).width>maxW&&line){lines.push(line);line=w;}else line=t;}if(line)lines.push(line);return lines;}
function loadImg(url){return new Promise((res,rej)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>res(i);i.onerror=rej;i.src=url;});}

async function drawCard(canvasId, photoUrl) {
  await document.fonts.ready;
  await Promise.allSettled([
    document.fonts.load('italic 400 40px "Source Serif 4"'),
    document.fonts.load('600 26px Inter'),
  ]);

  const W=780,PAD=56,IMG_PAD=36,CARD_R=36,LINE_H=58;
  const text="Today you took your first unassisted steps across the living room. You were so proud of yourself — and honestly, we were beside ourselves. Dad had to leave the room because he was crying. You looked back at us both with the biggest grin, like you knew exactly what you had done. These are the moments I never want to forget.";

  let photoImg=null;
  if(photoUrl){try{photoImg=await loadImg(photoUrl);}catch{}}
  if(photoImg&&photoImg.naturalWidth===0)photoImg=null;

  const imgW=W-IMG_PAD*2;
  const photoDisplayH=photoImg?Math.round(imgW*(photoImg.naturalHeight/photoImg.naturalWidth)):0;

  const mc=document.createElement('canvas');mc.width=W;
  const mctx=mc.getContext('2d');
  mctx.font='italic 400 40px "Source Serif 4"';
  const bodyLines=ctxWrapText(mctx,text,W-PAD*2);
  const textH=56+bodyLines.length*LINE_H+12+48+24+2+32+36+56;

  const topPad=photoImg?36:56;
  const photoSection=photoImg?topPad+photoDisplayH+24:0;
  const cardTop=photoImg?photoSection:topPad;
  const H=cardTop+textH;

  const canvas=document.getElementById(canvasId);
  canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');

  ctx.fillStyle='#E8F0E4';ctx.fillRect(0,0,W,H);

  if(photoImg){
    ctx.save();
    ctxRoundRect(ctx,IMG_PAD,topPad,imgW,photoDisplayH,20,'#000');
    ctx.clip();
    ctx.drawImage(photoImg,IMG_PAD,topPad,imgW,photoDisplayH);
    ctx.restore();
  }

  ctxRoundRect(ctx,0,cardTop,W,H-cardTop+16,CARD_R,'#F8FAF6');
  let y=cardTop+64;

  if(!photoImg){
    ctx.font='400 120px Georgia, serif';ctx.fillStyle='#CCDAC8';
    ctx.textAlign='right';ctx.fillText('"',W-PAD+18,cardTop+100);ctx.textAlign='left';
  }

  ctx.font='italic 400 34px "Source Serif 4"';ctx.fillStyle='#9AA89C';
  ctx.fillText('Dear Ellie,',PAD,y);y+=52;

  ctx.font='italic 400 40px "Source Serif 4"';ctx.fillStyle='#2C3828';
  bodyLines.forEach(line=>{ctx.fillText(line,PAD,y);y+=LINE_H;});
  y+=12;

  ctx.font='italic 400 32px "Source Serif 4"';ctx.fillStyle='#9AA89C';
  ctx.fillText('— Mom',PAD,y);y+=48;

  y+=24;ctx.fillStyle='#CCDAC8';ctx.fillRect(PAD,y,W-PAD*2,1.5);y+=32;

  ctx.font='600 26px Inter';ctx.fillStyle='#9AA89C';ctx.fillText('June 15, 2025',PAD,y);
  ctx.fillStyle='#C8993E';ctx.textAlign='right';ctx.fillText('Patina',W-PAD,y);ctx.textAlign='left';

  window._done=true;
}
`;

async function shot(label, outFile, photoUrl) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 420, height: 900 });
  await page.setContent(`
<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;1,400&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#C4D8C0;display:flex;flex-direction:column;align-items:center;padding:16px;gap:10px}canvas{max-width:390px;width:100%;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.2)}p{font-family:sans-serif;font-size:11px;color:#4A5E50;font-weight:700;letter-spacing:.5px}</style>
</head><body>
<p>${label}</p><canvas id="c"></canvas>
<script>
${CARD_JS}
drawCard('c', ${photoUrl ? `'${photoUrl}'` : 'null'});
</script></body></html>`);

  await page.waitForFunction(() => window._done === true, { timeout: 15000 });
  await page.waitForTimeout(400);
  const h = await page.evaluate(() => document.querySelector('canvas').getBoundingClientRect().bottom + 24);
  await page.setViewportSize({ width: 420, height: Math.ceil(h) });
  await page.screenshot({ path: outFile });
  await browser.close();
  console.log(outFile);
}

await shot('With photo (full, uncropped)', 'sharecard-photo.png', SAMPLE_IMG);
await shot('Text only', 'sharecard-text.png', null);
console.log('done');
