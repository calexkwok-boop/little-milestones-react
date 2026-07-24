// Canvas rendering for reel video export — a from-scratch reimplementation of
// the DOM/CSS reel (src/screens/reelShared.jsx, MonthlyReelScreen.jsx) as
// frame-by-frame draws, since MediaRecorder can only capture a <canvas>/<video>
// element, not arbitrary DOM. Timing/slide-building logic is reused as-is from
// reelShared.jsx (slideDurationMs, captionFor, videoThumbUrl) rather than
// duplicated — only the *drawing* is new.
//
// Not pixel-matched to the live CSS reel — Ken Burns easing, the intro title's
// shimmer sweep, and the closing stats' count-up are all simplified to static
// or linear approximations, since this renders once, unattended, into a
// silent export rather than being watched live.
import { slideDurationMs, videoThumbUrl } from './screens/reelShared.jsx';
import { cloudinaryTransform, VIDEO_DELIVERY_TRANSFORM } from './constants.js';

export const CANVAS_W = 1080;
export const CANVAS_H = 1920;

const INTRO_MS = 1500;
const CLOSING_MS = 2200;
const TRIP_ARC_STATIC_MS = 1800;
const CROSSFADE_MS = 500;

// Mirrors App.css kb1-kb4 — scale/translate fractions of the drawn image's
// own box, keyed by slide index exactly like the live screen (`i % 4`).
const KEN_BURNS = [
  { fromScale: 1.00, toScale: 1.04, fromX: 0,     toX: 0,     fromY: 0,     toY: 0 },
  { fromScale: 1.03, toScale: 1.00, fromX: -0.01, toX: 0.01,  fromY: 0,     toY: 0 },
  { fromScale: 1.00, toScale: 1.04, fromX: 0.01,  toX: -0.005,fromY: 0.005, toY: -0.005 },
  { fromScale: 1.03, toScale: 1.00, fromX: 0,     toX: 0,     fromY: -0.01, toY: 0.005 },
];

const GOLD = '#C8993E';
const CARD_BG = 'rgba(38,58,44,0.97)';
const CLOSING_BG = '#1E2A1E';

function lerp(a, b, t) { return a + (b - a) * t; }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2; }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// ── Timeline ────────────────────────────────────────────────────────────

export function buildExportTimeline(slides, { monthLabel, quote, stats }) {
  const items = [];
  let t = 0;
  items.push({ kind: 'intro', startMs: t, durationMs: INTRO_MS, monthLabel });
  t += INTRO_MS;
  slides.forEach((s, i) => {
    const durationMs = slideDurationMs(s, 1); // scale=1: unscaled base duration (no audio to sync against)
    items.push({ kind: 'slide', slide: s, index: i, startMs: t, durationMs });
    t += durationMs;
  });
  items.push({ kind: 'closing', startMs: t, durationMs: CLOSING_MS, monthLabel, quote, stats });
  t += CLOSING_MS;
  return { items, totalMs: t };
}

function itemAt(timeline, elapsedMs) {
  const { items } = timeline;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (elapsedMs < it.startMs + it.durationMs || i === items.length - 1) return { item: it, index: i };
  }
  return { item: items[items.length - 1], index: items.length - 1 };
}

// ── Asset preload ───────────────────────────────────────────────────────

function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Portrait/square photos fill the whole frame (cover-fit, cropping overflow)
// — that's the common case and cropping a small margin off a photo already
// close to the reel's own 9:16 shape isn't noticeable. Landscape photos are
// the opposite trade: cropping them to fill a 9:16 frame cuts off a real
// chunk of the photo, so those fall back to contain-fit — letterboxed on
// plain black (drawFrameAt already clears the canvas to black every frame,
// so there's nothing extra to draw for the bars) rather than a blurred
// cover-fill copy of the same photo, which read as an odd oversized ghost
// of the picture behind a small version of itself.
function isLandscape(w, h) { return w / h > 1.05; }

async function preloadPhotoLike(url, mediaType, assets, key) {
  if (mediaType === 'video') {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.src = cloudinaryTransform(url, VIDEO_DELIVERY_TRANSFORM);
    await new Promise((resolve) => {
      video.onloadeddata = resolve;
      video.onerror = resolve;
    });
    assets.videos.set(key, video);
    return;
  }
  const img = await loadImage(cloudinaryTransform(url, 'w_1600,q_auto,f_auto'));
  if (!img) return;
  assets.images.set(key, img);
}

export async function preloadAssets(timeline, onProgress) {
  const assets = { images: new Map(), videos: new Map(), avatars: new Map() };
  const slideItems = timeline.items.filter(it => it.kind === 'slide');
  let done = 0;
  for (const item of slideItems) {
    const s = item.slide;
    if (s.type === 'photo') {
      await preloadPhotoLike(s.url, s.mediaType, assets, item.index);
    } else if (s.type === 'trip') {
      await preloadPhotoLike(s.photo.url, s.photo.mediaType, assets, item.index);
      // Only one avatar is preloaded per trip slide (whichever person has
      // one) — the static-arc simplification's effort/value line. Stored
      // with its own URL so drawing can tell *whose* avatar it is, rather
      // than mistakenly showing it for every person who happens to have one.
      const avatarUrl = s.tripPeople?.find(p => p.avatar)?.avatar;
      if (avatarUrl) assets.avatars.set(item.index, { url: avatarUrl, img: await loadImage(cloudinaryTransform(avatarUrl, 'w_100,h_100,c_fill,q_auto,f_auto')) });
    } else if (s.type === 'text') {
      const avatarUrl = s.kidAvatar ?? s.kid?.avatar;
      if (avatarUrl) assets.avatars.set(item.index, { url: avatarUrl, img: await loadImage(cloudinaryTransform(avatarUrl, 'w_200,h_200,c_fill,q_auto,f_auto')) });
    }
    done++;
    onProgress?.(done / slideItems.length);
  }
  return assets;
}

// ── Text helpers ────────────────────────────────────────────────────────

function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCenteredLines(ctx, lines, cx, cy, lineHeight) {
  const totalH = lines.length * lineHeight;
  let y = cy - totalH / 2 + lineHeight / 2;
  for (const line of lines) {
    ctx.fillText(line, cx, y);
    y += lineHeight;
  }
}

function drawAvatarCircle(ctx, cx, cy, r, img, fallbackLetter, accent) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    const scale = Math.max((r * 2) / img.naturalWidth, (r * 2) / img.naturalHeight);
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  } else {
    ctx.fillStyle = accent || '#4A5E50';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    if (fallbackLetter) {
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.round(r)}px Urbanist, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fallbackLetter, cx, cy + r * 0.06);
    }
  }
  ctx.restore();
}

// ── Per-item draw functions ─────────────────────────────────────────────

function drawIntro(ctx, item) {
  ctx.fillStyle = CARD_BG;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(200,153,62,0.85)';
  ctx.font = 'italic 34px "Source Serif 4", serif';
  ctx.fillText('Your month with Patina', CANVAS_W / 2, CANVAS_H / 2 - 40);
  const gradient = ctx.createLinearGradient(CANVAS_W * 0.15, 0, CANVAS_W * 0.85, 0);
  gradient.addColorStop(0, '#fff');
  gradient.addColorStop(0.5, 'rgba(200,153,62,0.95)');
  gradient.addColorStop(1, '#fff');
  ctx.fillStyle = gradient;
  ctx.font = 'italic 700 92px "Cormorant Garamond", serif';
  const lines = wrapText(ctx, item.monthLabel, CANVAS_W - 120);
  drawCenteredLines(ctx, lines, CANVAS_W / 2, CANVAS_H / 2 + 40, 100);
}

function drawClosing(ctx, item) {
  const { monthLabel, quote, stats } = item;
  ctx.fillStyle = CLOSING_BG;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.textAlign = 'center';

  ctx.fillStyle = 'rgba(200,153,62,0.8)';
  ctx.font = '700 30px Urbanist, sans-serif';
  ctx.fillText(monthLabel.toUpperCase(), CANVAS_W / 2, CANVAS_H / 2 - 340);

  ctx.fillStyle = '#fff';
  ctx.font = '46px "Playfair Display", serif';
  const quoteLines = wrapText(ctx, `"${quote}"`, CANVAS_W - 200);
  drawCenteredLines(ctx, quoteLines, CANVAS_W / 2, CANVAS_H / 2 - 200, 58);

  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '600 26px Urbanist, sans-serif';
  ctx.fillText('— C.S. Lewis', CANVAS_W / 2, CANVAS_H / 2 - 40);

  const tiles = [
    { n: stats.letters, label: `letter${stats.letters !== 1 ? 's' : ''}` },
    stats.milestones > 0 && { n: stats.milestones, label: `milestone${stats.milestones !== 1 ? 's' : ''}` },
    stats.photos > 0 && { n: stats.photos, label: `photo${stats.photos !== 1 ? 's' : ''}` },
  ].filter(Boolean);
  const tileW = 280, tileH = 220, gap = 30;
  const totalW = tiles.length * tileW + (tiles.length - 1) * gap;
  let x = (CANVAS_W - totalW) / 2;
  const y = CANVAS_H / 2 + 60;
  for (const tile of tiles) {
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    roundRect(ctx, x, y, tileW, tileH, 20);
    ctx.fill();
    ctx.fillStyle = GOLD;
    ctx.font = '800 76px Urbanist, sans-serif';
    ctx.fillText(String(tile.n), x + tileW / 2, y + 100);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '600 22px Urbanist, sans-serif';
    ctx.fillText(tile.label, x + tileW / 2, y + 150);
    x += tileW + gap;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPhotoLike(ctx, index, elapsedIntoSlide, durationMs, cropY, assets) {
  const video = assets.videos.get(index);
  const img = assets.images.get(index);
  const source = video || img;
  if (!source) return;

  const kb = KEN_BURNS[index % 4];
  const t = easeInOut(clamp01(elapsedIntoSlide / durationMs));
  const scale = lerp(kb.fromScale, kb.toScale, t);
  const dx = lerp(kb.fromX, kb.toX, t) * CANVAS_W;
  const dy = lerp(kb.fromY, kb.toY, t) * CANVAS_H;

  const naturalW = video ? video.videoWidth : source.naturalWidth;
  const naturalH = video ? video.videoHeight : source.naturalHeight;
  if (!naturalW || !naturalH) return;

  // Landscape photos use contain-fit, so the whole photo stays visible,
  // letterboxed on the plain black the canvas already clears to every frame;
  // everything else uses cover-fit, filling the frame with a small,
  // unnoticeable crop. See isLandscape.
  const landscape = isLandscape(naturalW, naturalH);
  const fitScale = (landscape ? Math.min(CANVAS_W / naturalW, CANVAS_H / naturalH) : Math.max(CANVAS_W / naturalW, CANVAS_H / naturalH)) * scale;
  const w = naturalW * fitScale, h = naturalH * fitScale;
  const x = (CANVAS_W - w) / 2 + dx;
  // Horizontal crop stays centered; vertical crop follows the entry's own
  // configured cropY (0 = top-aligned, 100 = bottom-aligned), same semantics
  // as the live app's `background-position: center {cropY}%`. Irrelevant
  // (and harmless) for contain-fit, since nothing overflows to crop there.
  const y = (CANVAS_H - h) * ((cropY ?? 50) / 100) + dy;
  ctx.drawImage(source, x, y, w, h);

  // Bottom vignette — identical every frame, cheap enough to redraw directly.
  const grad = ctx.createLinearGradient(0, CANVAS_H * 0.55, 0, CANVAS_H);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, CANVAS_H * 0.55, CANVAS_W, CANVAS_H * 0.45);
}

function drawCaption(ctx, caption) {
  if (!caption) return;
  ctx.textAlign = 'center';
  ctx.font = '700 28px Urbanist, sans-serif';
  const padX = 28, padY = 14;
  const textW = ctx.measureText(caption).width;
  const boxW = textW + padX * 2, boxH = 56 + padY;
  const x = (CANVAS_W - boxW) / 2, y = CANVAS_H - 220;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, x, y, boxW, boxH, 12);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(caption, CANVAS_W / 2, y + boxH / 2 + 10);
}

function drawPhotoSlide(ctx, item, elapsedIntoSlide, assets) {
  drawPhotoLike(ctx, item.index, elapsedIntoSlide, item.durationMs, item.slide.cropY, assets);
  drawCaption(ctx, item.slide.caption);
}

function drawTextSlide(ctx, item, assets) {
  const s = item.slide;
  ctx.fillStyle = CARD_BG;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const kidFirst = s.kidName ?? s.kid?.name?.split(' ')[0];
  const accent = s.kidAccent ?? s.kid?.accent;
  const cx = CANVAS_W / 2;
  let y = CANVAS_H / 2 - 160;

  if (kidFirst || accent) {
    drawAvatarCircle(ctx, cx, y, 56, assets.avatars.get(item.index)?.img, kidFirst?.charAt(0), accent);
    y += 130;
  }

  ctx.textAlign = 'center';
  if (s.subtype === 'letter') {
    if (kidFirst) {
      ctx.fillStyle = 'rgba(200,153,62,0.85)';
      ctx.font = 'italic 30px "Source Serif 4", serif';
      ctx.fillText(`Dear ${kidFirst},`, cx, y);
      y += 60;
    }
    ctx.fillStyle = '#fff';
    ctx.font = 'italic 42px "Source Serif 4", serif';
    const lines = wrapText(ctx, s.text, CANVAS_W - 220);
    drawCenteredLines(ctx, lines, cx, y + lines.length * 30, 64);
  } else {
    ctx.fillStyle = 'rgba(200,153,62,0.6)';
    ctx.font = '104px "Playfair Display", serif';
    ctx.fillText('"', cx, y + 30);
    y += 90;
    ctx.fillStyle = '#fff';
    ctx.font = '700 40px Urbanist, sans-serif';
    const lines = wrapText(ctx, s.text, CANVAS_W - 220);
    drawCenteredLines(ctx, lines, cx, y + lines.length * 28, 54);
    if (kidFirst) {
      ctx.fillStyle = 'rgba(200,153,62,0.85)';
      ctx.font = '700 24px Urbanist, sans-serif';
      ctx.fillText(kidFirst.toUpperCase(), cx, y + lines.length * 56 + 50);
    }
  }
}

// Static arc card (home → destination dashed line, avatars, distance) instead
// of the live reel's animated plane-along-a-bezier — real content, without
// reimplementing an SVG offset-path motion animation in canvas for a
// silent, unattended export. See plan doc for the reasoning.
function drawTripArc(ctx, item, assets) {
  const s = item.slide;
  ctx.fillStyle = CARD_BG;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'italic 30px "Source Serif 4", serif';
  const dateLabel = new Date(`${s.earliestDate}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  ctx.fillText(dateLabel, CANVAS_W / 2, CANVAS_H / 2 - 320);

  if (s.tripPeople?.length) {
    // Only one avatar is preloaded per trip slide (see preloadAssets) —
    // match it back to whichever person it actually belongs to; everyone
    // else falls back to their initial, same as a missing avatar does live.
    const preloaded = assets.avatars.get(item.index);
    const r = 30, overlap = 18;
    const totalW = r * 2 + (s.tripPeople.length - 1) * (r * 2 - overlap);
    let x = CANVAS_W / 2 - totalW / 2 + r;
    for (let i = 0; i < s.tripPeople.length; i++) {
      const person = s.tripPeople[i];
      const img = person.avatar && person.avatar === preloaded?.url ? preloaded.img : null;
      drawAvatarCircle(ctx, x, CANVAS_H / 2 - 240, r, img, person.name?.charAt(0), person.accent);
      x += r * 2 - overlap;
    }
  }

  const boxCx = CANVAS_W / 2, boxCy = CANVAS_H / 2 - 40;
  const homeX = boxCx - 260, homeY = boxCy + 100;
  const destX = boxCx + 260, destY = boxCy - 100;
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 14]);
  ctx.beginPath();
  ctx.moveTo(homeX, homeY);
  ctx.quadraticCurveTo(boxCx, boxCy - 220, destX, destY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = GOLD;
  [[homeX, homeY], [destX, destY]].forEach(([px, py]) => {
    ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill();
  });

  ctx.font = '600 24px Urbanist, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('Home', homeX, homeY + 44);
  ctx.fillStyle = '#E5C97E';
  ctx.font = '700 24px Urbanist, sans-serif';
  ctx.fillText(s.destinationLabel, destX, destY + 44);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '600 22px Urbanist, sans-serif';
  ctx.fillText(`${s.distanceMiles.toLocaleString()} miles from home`, CANVAS_W / 2, CANVAS_H / 2 + 260);
}
function drawTripSlide(ctx, item, elapsedIntoSlide, assets) {
  if (elapsedIntoSlide < TRIP_ARC_STATIC_MS) {
    drawTripArc(ctx, item, assets);
    return;
  }
  const photoElapsed = elapsedIntoSlide - TRIP_ARC_STATIC_MS;
  drawPhotoLike(ctx, item.index, photoElapsed, item.durationMs - TRIP_ARC_STATIC_MS, item.slide.photo.cropY, assets);
  drawCaption(ctx, item.slide.photoCaption);
}

// ── Frame dispatch with crossfade ───────────────────────────────────────

function drawItem(ctx, item, elapsedMs, assets) {
  if (item.kind === 'intro') return drawIntro(ctx, item);
  if (item.kind === 'closing') return drawClosing(ctx, item);
  const elapsedIntoSlide = elapsedMs - item.startMs;
  const s = item.slide;
  if (s.type === 'trip') return drawTripSlide(ctx, item, elapsedIntoSlide, assets);
  if (s.type === 'text') return drawTextSlide(ctx, item, assets);
  return drawPhotoSlide(ctx, item, elapsedIntoSlide, assets);
}

export function drawFrameAt(ctx, timeline, elapsedMs, assets) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const { item, index } = itemAt(timeline, elapsedMs);
  const next = timeline.items[index + 1];
  const msIntoItem = elapsedMs - item.startMs;
  const msLeftInItem = item.durationMs - msIntoItem;

  drawItem(ctx, item, elapsedMs, assets);

  if (next && msLeftInItem < CROSSFADE_MS && msLeftInItem >= 0) {
    const alpha = 1 - msLeftInItem / CROSSFADE_MS;
    ctx.save();
    ctx.globalAlpha = clamp01(alpha);
    drawItem(ctx, next, next.startMs, assets);
    ctx.restore();
  }
}
