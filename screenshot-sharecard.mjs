import { chromium } from 'playwright';

const SAMPLE_IMG = 'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?w=1200&q=85';

const CARD_JS = `
function ctxRoundRect(ctx,x,y,w,h,r,fill){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();ctx.fillStyle=fill;ctx.fill();}
function ctxWrapText(ctx,text,maxW){const words=text.split(' '),lines=[];let line='';for(const w of words){const t=line?line+' '+w:w;if(ctx.measureText(t).width>maxW&&line){lines.push(line);line=w;}else line=t;}if(line)lines.push(line);return lines;}
function loadImg(url){return new Promise((res,rej)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>res(i);i.onerror=rej;i.src=url;});}

async function drawCard(canvasId, photoUrl) {
  await document.fonts.ready;
  await Promise.allSettled([
    document.fonts.load('italic 400 44px "Source Serif 4"'),
    document.fonts.load('600 30px Inter'),
  ]);

  const W=1080,H=1350,PAD=80,CARD_R=48;
  const PHOTO_H=560;
  const text="Today you took your first unassisted steps across the living room. You were so proud of yourself — and honestly, we were beside ourselves. Dad had to leave the room because he was crying. You looked back at us both with the biggest grin, like you knew exactly what you had done. These are the moments I never want to forget.";

  let photoImg=null;
  if(photoUrl){try{photoImg=await loadImg(photoUrl);}catch{}}
  if(photoImg&&photoImg.naturalWidth===0)photoImg=null;

  const cardTop=photoImg?PHOTO_H-48:80;
  const canvas=document.getElementById(canvasId);
  canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');

  ctx.fillStyle='#E8F0E4';ctx.fillRect(0,0,W,H);

  if(photoImg){
    const scale=Math.max(W/photoImg.naturalWidth,PHOTO_H/photoImg.naturalHeight);
    const sw=W/scale,sh=PHOTO_H/scale;
    const sx=(photoImg.naturalWidth-sw)/2,sy=(photoImg.naturalHeight-sh)/2;
    ctx.save();ctx.beginPath();ctx.rect(0,0,W,PHOTO_H);ctx.clip();
    ctx.drawImage(photoImg,sx,sy,sw,sh,0,0,W,PHOTO_H);
    ctx.restore();
  }

  ctxRoundRect(ctx,0,cardTop,W,H-cardTop+20,CARD_R,'#F8FAF6');
  let y=cardTop+88;

  if(!photoImg){
    ctx.font='400 160px Georgia, serif';ctx.fillStyle='#CCDAC8';
    ctx.textAlign='right';ctx.fillText('"',W-PAD+24,cardTop+138);ctx.textAlign='left';
  }

  ctx.font='italic 400 40px "Source Serif 4"';ctx.fillStyle='#9AA89C';
  ctx.fillText('Dear Ellie,',PAD,y);y+=64;

  ctx.font='italic 400 44px "Source Serif 4"';ctx.fillStyle='#2C3828';
  const allLines=ctxWrapText(ctx,text,W-PAD*2);
  const LINE_H=68,sigH=56,footerH=28+2+40+60;
  const availH=H-y-sigH-footerH;
  const maxLines=Math.floor(availH/LINE_H);
  const truncated=allLines.length>maxLines;
  const visible=truncated?allLines.slice(0,maxLines-1):allLines;
  visible.forEach(line=>{ctx.fillText(line,PAD,y);y+=LINE_H;});
  if(truncated){ctx.fillStyle='#9AA89C';ctx.fillText(allLines[maxLines-1].replace(/\\s+\\S+$/,'')+' …',PAD,y);y+=LINE_H;}
  y+=16;

  ctx.font='italic 400 38px "Source Serif 4"';ctx.fillStyle='#9AA89C';
  ctx.fillText('— Mom',PAD,y);y+=sigH;

  y+=28;ctx.fillStyle='#CCDAC8';ctx.fillRect(PAD,y,W-PAD*2,1.5);y+=40;

  ctx.font='600 30px Inter';ctx.fillStyle='#9AA89C';ctx.fillText('June 15, 2025',PAD,y);
  ctx.fillStyle='#C8993E';ctx.textAlign='right';ctx.fillText('Patina',W-PAD,y);ctx.textAlign='left';
}
`;

async function shot(label, outFile, photoUrl) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 560, height: 740 });
  await page.setContent(`
<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;1,400&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#C4D8C0;display:flex;flex-direction:column;align-items:center;padding:16px;gap:10px}canvas{max-width:528px;width:100%;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.2)}p{font-family:sans-serif;font-size:12px;color:#4A5E50;font-weight:700;letter-spacing:.5px}</style>
</head><body>
<p>${label}</p><canvas id="c"></canvas>
<script>
${CARD_JS}
drawCard('c', ${photoUrl ? `'${photoUrl}'` : 'null'}).then(()=>window._done=true);
</script></body></html>`);

  await page.waitForFunction(() => window._done === true, { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: outFile });
  await browser.close();
  console.log(outFile);
}

await shot('With photo (cover crop)', 'sharecard-photo.png', SAMPLE_IMG);
await shot('Text only', 'sharecard-text.png', null);
console.log('done');
